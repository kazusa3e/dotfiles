import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const TTFT_KEY = "response-ttft";
export const OUTPUT_KEY = "response-output-speed";
export const REQUEST_KEY = "response-request-time";
export const TOOL_KEY = "response-tool-time";
const MIN_SAMPLE_MS = 250;
const REPAINT_MS = 250;

type Phase = "idle" | "waiting" | "thinking" | "toolcall" | "text" | "done" | "tool" | "aborted" | "error";

// This is a display heuristic, not a tokenizer. CJK scripts need a different
// weight from Latin text; provider totals cannot isolate visible prose.
export function estimateTokens(text: string): number {
  let count = 0;
  for (const char of text) {
    count += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char) ? 1 : 0.25;
  }
  return count;
}

export class ResponseMetrics {
  phase: Phase = "idle";
  private requestStart: number | undefined;
  private requestEnd: number | undefined;
  private requestFailed = false;
  private firstDelta: number | undefined;
  private lastDelta: number | undefined;
  private generatedTokens = 0;
  private accepting = false;

  reset(): void {
    this.phase = "idle";
    this.requestStart = undefined;
    this.requestEnd = undefined;
    this.requestFailed = false;
    this.firstDelta = undefined;
    this.lastDelta = undefined;
    this.generatedTokens = 0;
    this.accepting = false;
  }

  prepare(): void {
    this.reset();
    this.phase = "waiting";
  }

  start(now: number): void {
    this.prepare();
    this.requestStart = now;
    this.accepting = true;
  }

  record(event: AssistantMessageEvent, now: number): void {
    if (!this.accepting) return;
    if (event.type === "thinking_start" || event.type === "thinking_delta") {
      this.phase = "thinking";
    } else if (event.type === "toolcall_start" || event.type === "toolcall_delta") {
      this.phase = "toolcall";
    } else if (event.type === "text_start") {
      this.phase = "text";
    }

    if (event.type !== "text_delta" && event.type !== "thinking_delta" && event.type !== "toolcall_delta") return;
    if (!event.delta) return;
    // Count all streamed output, not hidden reasoning or provider usage totals.
    // Exclude the first chunk, but keep gaps across content/phase transitions.
    if (this.firstDelta !== undefined) this.generatedTokens += estimateTokens(event.delta);
    this.firstDelta ??= now;
    this.lastDelta = now;
    if (event.type === "text_delta") this.phase = "text";
  }

  finish(reason: string, now = performance.now()): void {
    if (this.accepting) {
      this.requestEnd = now;
      this.requestFailed = reason === "aborted" || reason === "error";
    }
    this.accepting = false;
    this.phase = reason === "aborted" ? "aborted" : reason === "error" ? "error" : "done";
  }

  tool(now = performance.now()): void {
    this.finish("stop", now);
    this.phase = "tool";
  }

  get active(): boolean { return this.accepting; }

  requestSeconds(now: number): number | undefined {
    return this.requestStart === undefined ? undefined
      : Math.max(0, (this.requestEnd ?? now) - this.requestStart) / 1000;
  }

  requestLabel(now: number): string {
    const seconds = this.requestSeconds(now);
    if (seconds === undefined) return "Req —";
    const marker = this.accepting ? "▸" : this.requestFailed ? "!" : "";
    return `Req ${marker}${seconds.toFixed(1)}s`;
  }

  get ttftSeconds(): number | undefined {
    return this.firstDelta === undefined || this.requestStart === undefined
      ? undefined : Math.max(0, this.firstDelta - this.requestStart) / 1000;
  }

  get outputRate(): number | undefined {
    if (this.firstDelta === undefined || this.lastDelta === undefined) return undefined;
    const elapsedMs = Math.max(0, this.lastDelta - this.firstDelta);
    return elapsedMs >= MIN_SAMPLE_MS && this.generatedTokens > 0
      ? this.generatedTokens / (elapsedMs / 1000) : undefined;
  }

  labels(): [string, string] {
    const ttft = this.ttftSeconds;
    const latency = ttft === undefined
      ? (this.phase === "waiting" ? "…" : "—") : `${ttft.toFixed(2)}s`;
    const rate = this.outputRate;
    const state = {
      idle: "", waiting: "waiting", thinking: "thinking", toolcall: "tool call",
      text: "sampling", done: "", tool: "tool", aborted: "aborted", error: "error",
    }[this.phase];
    const showRate = rate !== undefined
      && this.phase !== "idle" && this.phase !== "waiting"
      && this.phase !== "aborted" && this.phase !== "error";
    const output = showRate ? `~${Math.round(rate)} tok/s` : `—${state ? ` (${state})` : ""}`;
    return [`TTFT ${latency}`, `Out ${output}`];
  }
}

export class ToolMetrics {
  private started: number | undefined;
  private ended: number | undefined;
  private calls = new Set<string>();
  private failed = false;

  get active(): boolean { return this.calls.size > 0; }

  reset(): void {
    this.started = undefined;
    this.ended = undefined;
    this.calls.clear();
    this.failed = false;
  }

  start(id: string, now: number): void {
    this.started ??= now;
    this.ended = undefined;
    this.calls.add(id);
  }

  end(id: string, now: number, isError: boolean): void {
    if (!this.calls.delete(id)) return;
    this.failed ||= isError;
    if (!this.active) this.ended = now;
  }

  cancel(now: number): void {
    if (!this.active) return;
    this.failed = true;
    this.calls.clear();
    this.ended = now;
  }

  seconds(now: number): number | undefined {
    // A batch spans first start to last end, including scheduling gaps between
    // sequential siblings. Parallel durations must not be added together.
    return this.started === undefined ? undefined
      : Math.max(0, (this.ended ?? now) - this.started) / 1000;
  }

  label(now: number): string | undefined {
    const seconds = this.seconds(now);
    if (seconds === undefined) return undefined;
    const marker = this.failed ? "!" : "";
    return `Tool ${marker}${this.active ? "▸" : ""}${seconds.toFixed(1)}s`;
  }
}

const STATUS_KEYS = [TTFT_KEY, OUTPUT_KEY, REQUEST_KEY, TOOL_KEY] as const;

export default function (pi: ExtensionAPI) {
  const metrics = new ResponseMetrics();
  const tools = new ToolMetrics();
  let turnActive = false;
  let toolBatchStarted = false;
  let lastPaint = -Infinity;
  let previous: (string | undefined)[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const publish = (ctx: ExtensionContext, force = false) => {
    if (ctx.mode !== "tui") return;
    const now = performance.now();
    if (!force && now - lastPaint < REPAINT_MS) return;
    lastPaint = now;
    const labels = [...metrics.labels(), metrics.requestLabel(now), tools.label(now)];
    for (const [index, key] of STATUS_KEYS.entries()) {
      if (previous.length === 0 || labels[index] !== previous[index]) ctx.ui.setStatus(key, labels[index]);
    }
    previous = labels;
  };
  const syncTimer = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || (!metrics.active && !tools.active)) {
      stopTimer();
      return;
    }
    if (timer === undefined) {
      timer = setInterval(() => publish(ctx), REPAINT_MS);
      timer.unref?.();
    }
  };
  const reset = (_event: unknown, ctx: ExtensionContext) => {
    stopTimer();
    turnActive = false;
    toolBatchStarted = false;
    metrics.reset();
    tools.reset();
    previous = [];
    publish(ctx, true);
  };

  pi.on("session_start", reset);
  pi.on("agent_start", reset);
  pi.on("model_select", reset);
  pi.on("session_before_switch", reset);
  pi.on("session_before_fork", reset);
  pi.on("session_before_tree", reset);
  pi.on("turn_start", (_event, ctx) => {
    stopTimer();
    turnActive = true;
    toolBatchStarted = false;
    metrics.prepare();
    publish(ctx, true);
  });
  pi.on("before_provider_request", (_event, ctx) => {
    if (!turnActive) return;
    metrics.start(performance.now());
    syncTimer(ctx);
    publish(ctx, true);
  });
  pi.on("message_update", (event, ctx) => {
    if (!turnActive || event.message.role !== "assistant") return;
    const phase = metrics.phase;
    const ttft = metrics.ttftSeconds;
    metrics.record(event.assistantMessageEvent, performance.now());
    publish(ctx, phase !== metrics.phase || ttft !== metrics.ttftSeconds);
  });
  pi.on("message_end", (event, ctx) => {
    if (!turnActive || event.message.role !== "assistant") return;
    metrics.finish(event.message.stopReason);
    syncTimer(ctx);
    publish(ctx, true);
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (!turnActive) return;
    if (!toolBatchStarted) {
      tools.reset();
      toolBatchStarted = true;
    }
    const now = performance.now();
    tools.start(event.toolCallId, now);
    metrics.tool(now);
    syncTimer(ctx);
    publish(ctx, true);
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if (!turnActive || !toolBatchStarted) return;
    tools.end(event.toolCallId, performance.now(), event.isError);
    syncTimer(ctx);
    publish(ctx, true);
  });
  pi.on("turn_end", (event, ctx) => {
    turnActive = false;
    stopTimer();
    tools.cancel(performance.now());
    if (event.outcome === "aborted" || event.outcome === "error") metrics.finish(event.outcome);
    else if (metrics.phase !== "tool" && metrics.phase !== "aborted" && metrics.phase !== "error") metrics.finish("stop");
    publish(ctx, true);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    stopTimer();
    turnActive = false;
    if (ctx.mode !== "tui") return;
    for (const key of STATUS_KEYS) ctx.ui.setStatus(key, undefined);
  });
}
