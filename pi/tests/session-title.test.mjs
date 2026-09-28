import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const root = process.env.PI_PACKAGE_ROOT;
if (!root) throw new Error("Set PI_PACKAGE_ROOT to the installed pi package directory");
const { createJiti } = await import(pathToFileURL(`${root}/node_modules/jiti/lib/jiti.mjs`));
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-coding-agent": `${root}/dist/index.js` } });
const { default: extension, firstPrompt, fullHistory, normalizeTitle } = await jiti.import("../.pi/agent/extensions/session-title.ts");
const entry = (id, parentId, content) => ({ id, parentId, type: "message", timestamp: "2026-01-01", message: { role: "user", content, timestamp: 0 } });

test("normalizes titles without splitting Unicode characters", () => {
  assert.equal(normalizeTitle('\n标题："Hello"\nignored'), "Hello");
  assert.equal(Array.from(normalizeTitle("😀".repeat(60))).length, 56);
  assert.equal(normalizeTitle("  "), undefined);
});

test("automatic input supports string content and redacts secrets", () => {
  assert.equal(firstPrompt([entry("a", null, "TOKEN=secret hello")]), "TOKEN=[redacted] hello");
});

test("full history retains pre-compaction messages and honors context edits", () => {
  const entries = [entry("a", null, "old"),
    { id: "b", parentId: "a", type: "compaction", timestamp: "2026-01-01", summary: "summary", firstKeptEntryId: "b", tokensBefore: 5 },
    entry("c", "b", "new"),
    { id: "d", parentId: "c", type: "context_edit", timestamp: "2026-01-01", targetId: "a", replacement: { content: "edited" } }];
  const context = fullHistory(entries);
  assert.deepEqual(context.messages.slice(0, -1).map(m => m.content), ["edited", "new"]);
  assert.deepEqual(fullHistory(entries), context);
});

function harness(result) {
  const events = new Map();
  const commands = new Map();
  let name;
  const notifications = [];
  const pi = { on: (event, fn) => events.set(event, fn), registerCommand: (name, command) => commands.set(name, command), getSessionName: () => name, setSessionName: value => { name = value; } };
  const ctx = {
    hasUI: true, ui: { notify: (...args) => notifications.push(args) },
    model: {}, getSystemPrompt: () => "system", waitForIdle: async () => {},
    sessionManager: { getSessionId: () => "session", getBranch: () => [entry("a", null, "first request")] },
    modelRegistry: { hasConfiguredAuth: () => true, streamSimple: (_model, context, options) => { ctx.request = { context, options }; return { result }; } },
  };
  extension(pi);
  return { events, commands, ctx, pi, notifications };
}
const response = { stopReason: "stop", content: [{ type: "text", text: "New title" }] };

test("only retitle is registered; full request enables stable cache identity", async () => {
  const h = harness(async () => response);
  assert.deepEqual([...h.commands.keys()], ["retitle"]);
  await h.commands.get("retitle").handler("", h.ctx);
  assert.equal(h.pi.getSessionName(), "New title");
  assert.equal(h.ctx.request.options.cacheRetention, "short");
  assert.equal(h.ctx.request.options.sessionId, "session");
});

test("manual provider failure preserves the existing title", async () => {
  const h = harness(async () => { throw new Error("failure"); });
  h.pi.setSessionName("Existing");
  await h.commands.get("retitle").handler("", h.ctx);
  assert.equal(h.pi.getSessionName(), "Existing");
  assert.equal(h.notifications[0][1], "warning");
});

for (const change of ["session_before_tree", "session_before_switch", "session_before_fork", "agent_start", "session_info_changed"]) {
  test(`${change} invalidates an in-flight result`, async () => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; }));
    const task = h.commands.get("retitle").handler("", h.ctx);
    await new Promise(r => setImmediate(r));
    h.events.get(change)();
    resolve(response);
    await task;
    assert.equal(h.pi.getSessionName(), undefined);
    assert.equal(h.notifications.length, 0);
  });
}
