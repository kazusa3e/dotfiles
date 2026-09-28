import { buildSessionContext, convertToLlm, type ExtensionAPI, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Context } from "@earendil-works/pi-ai";

const TITLE_LIMIT = 56;
const TIMEOUT_MS = 30_000;
const TITLE_REQUEST = "Generate a concise title for this conversation, prioritizing its final goal and outcome. Use the user's language. Return only the title, without quotes, formatting, explanation, or tool calls. Keep it within 56 characters.";

export function normalizeTitle(value: string): string | undefined {
  const title = value.trim().split(/\r?\n/, 1)[0]
    .replace(/^\s*(?:title|标题)\s*[:：-]\s*/i, "")
    .replace(/^[\s\"'`*_#]+|[\s\"'`*_#]+$/g, "")
    .replace(/\s+/g, " ").trim();
  return title ? Array.from(title).slice(0, TITLE_LIMIT).join("") : undefined;
}

function redact(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g, "[redacted]")
    .replace(/\b([\w.-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[\w.-]*)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

export function firstPrompt(entries: SessionEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const content = entry.message.content;
    const text = (typeof content === "string" ? content : content
      .filter(part => part.type === "text").map(part => part.text).join("\n")).trim();
    if (text) return redact(text).slice(0, 2000);
  }
}

export function fullHistory(entries: SessionEntry[]): Context {
  // Keep parent links while bypassing compaction; context edits still apply.
  const expanded: SessionEntry[] = entries.map(entry => entry.type === "compaction"
    ? { id: entry.id, parentId: entry.parentId, timestamp: entry.timestamp,
        type: "custom", customType: "session-title-compaction-boundary", data: null }
    : entry);
  const messages = convertToLlm(buildSessionContext(expanded).messages);
  messages.push({ role: "user", content: TITLE_REQUEST, timestamp: 0 });
  return { messages };
}

export default function (pi: ExtensionAPI) {
  let pending: AbortController | undefined;
  let attemptedSession: string | undefined;
  let revision = 0;

  const cancel = () => {
    revision++;
    pending?.abort();
    pending = undefined;
  };

  async function nameSession(ctx: ExtensionContext, manual: boolean): Promise<void> {
    const sessionId = ctx.sessionManager.getSessionId();
    const originalName = pi.getSessionName();
    if (!manual && (originalName?.trim() || pending || attemptedSession === sessionId)) return;
    const entries = ctx.sessionManager.getBranch();
    const prompt = firstPrompt(entries);
    if (!prompt) {
      if (manual && ctx.hasUI) ctx.ui.notify("No user text available for a session title", "warning");
      return;
    }

    cancel();
    attemptedSession = sessionId;
    const runRevision = revision;
    const controller = new AbortController();
    pending = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    const current = () => revision === runRevision && pending === controller
      && ctx.sessionManager.getSessionId() === sessionId && pi.getSessionName() === originalName;

    try {
      let title: string | undefined;
      try {
        const model = ctx.model;
        if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) throw new Error("Model authentication unavailable");
        const context: Context = manual ? fullHistory(entries) : {
          systemPrompt: "Create a session title from the supplied message. " + TITLE_REQUEST,
          messages: [{ role: "user", content: prompt, timestamp: 0 }],
        };
        // Preserve stored system/tool declarations; legacy sessions need a leading prompt.
        if (manual && context.messages[0]?.role !== "system") context.systemPrompt = ctx.getSystemPrompt();
        const response = await ctx.modelRegistry.streamSimple(model, context, {
          signal: controller.signal,
          timeoutMs: TIMEOUT_MS,
          maxRetries: 0,
          maxTokens: 512,
          reasoning: "minimal",
          cacheRetention: "short",
          sessionId,
        }).result();
        if (timedOut) throw new Error("Title request timed out");
        if (response.stopReason !== "stop") throw new Error("Title request did not complete successfully");
        if (response.content.some(part => part.type === "toolCall")) throw new Error("Model returned a tool call instead of a title");
        title = normalizeTitle(response.content.filter(part => part.type === "text").map(part => part.text).join("\n"));
        if (!title) throw new Error("Model returned an empty title");
      } catch {
        if (!current() || (controller.signal.aborted && !timedOut)) return;
        if (manual) {
          if (ctx.hasUI) ctx.ui.notify(timedOut
            ? "Title request timed out; session name unchanged"
            : "Title generation failed (check authentication, provider, or context size); session name unchanged", "warning");
          return;
        }
        title = normalizeTitle(prompt.replace(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+/g, " "));
      }
      if (!title || !current()) return;
      pi.setSessionName(title);
      if (manual && ctx.hasUI) ctx.ui.notify(`Session named: ${title}`, "info");
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = undefined;
    }
  }

  pi.on("agent_settled", (_event, ctx) => { void nameSession(ctx, false).catch(() => {}); });
  pi.registerCommand("retitle", {
    description: "Rename from full branch history, including tool results and images, using the current model",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      await nameSession(ctx, true);
    },
  });
  pi.on("session_start", () => { cancel(); attemptedSession = undefined; });
  pi.on("session_before_switch", cancel);
  pi.on("session_before_fork", cancel);
  pi.on("session_before_tree", cancel);
  pi.on("session_shutdown", cancel);
  pi.on("model_select", cancel);
  pi.on("agent_start", cancel);
  pi.on("session_info_changed", cancel);
}
