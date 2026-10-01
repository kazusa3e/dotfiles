import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const root = process.env.PI_PACKAGE_ROOT;
if (!root) throw new Error("Set PI_PACKAGE_ROOT to the installed pi package directory");
const { createJiti } = await import(pathToFileURL(`${root}/node_modules/jiti/lib/jiti.mjs`));
const jiti = createJiti(import.meta.url);
const { default: extension, ResponseMetrics, ToolMetrics, estimateTokens, TTFT_KEY, OUTPUT_KEY, REQUEST_KEY, TOOL_KEY } =
  await jiti.import("../.pi/agent/extensions/response-metrics.ts");
const delta = (type, text, index = 0) => ({ type, delta: text, contentIndex: index, partial: { usage: { output: 0 } } });

for (const type of ["text_delta", "thinking_delta", "toolcall_delta"]) {
  test(`TTFT uses the first nonempty ${type}`, () => {
    const m = new ResponseMetrics();
    m.start(100);
    m.record(delta(type, ""), 200);
    assert.equal(m.ttftSeconds, undefined);
    m.record(delta(type, "first"), 1100);
    m.record(delta(type, "later"), 2100);
    assert.equal(m.ttftSeconds, 1);
  });
}

test("metadata does not count as first output", () => {
  const m = new ResponseMetrics();
  m.start(0);
  for (const type of ["text_start", "thinking_start", "toolcall_start"]) {
    m.record({ type, contentIndex: 0 }, 100);
  }
  assert.equal(m.ttftSeconds, undefined);
});

test("output rate counts all streamed deltas and excludes the first chunk", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("text_delta", "x".repeat(1000)), 1000);
  m.record(delta("text_delta", "a".repeat(40)), 2000);
  assert.equal(m.outputRate, 10);
  m.finish("stop");
  assert.deepEqual(m.labels(), ["TTFT 1.00s", "Out ~10 tok/s"]);
});

test("output rate includes thinking and tool-call deltas", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("thinking_delta", "reasoning".repeat(1000)), 1000);
  m.record(delta("toolcall_delta", "arguments".repeat(1000), 1), 3000);
  m.record(delta("text_delta", "first", 2), 8000);
  const e = delta("text_delta", "a".repeat(40), 2);
  e.partial.usage = { output: 1000000, reasoning: 999000 };
  m.record(e, 9000);
  assert.equal(m.ttftSeconds, 1);
  assert.ok(m.outputRate > 10);
});

test("interleaved thinking and tool-call deltas contribute to output rate", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("text_delta", "first"), 1000);
  m.record(delta("text_delta", "a".repeat(40)), 2000);
  m.record({ type: "thinking_start", contentIndex: 1 }, 2500);
  m.record(delta("thinking_delta", "thinking", 1), 10000);
  m.record(delta("text_delta", "first again", 2), 20000);
  m.record(delta("text_delta", "a".repeat(80), 2), 21000);
  m.record({ type: "toolcall_start", contentIndex: 3 }, 22000);
  m.record(delta("text_delta", "third start", 4), 30000);
  m.record(delta("text_delta", "a".repeat(120), 4), 31000);
  assert.ok(m.outputRate > 2 && m.outputRate < 3);
});

test("output rate spans gaps between all streamed deltas", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("text_delta", "first"), 1000);
  m.record(delta("text_delta", "a".repeat(40)), 2000);
  m.record(delta("text_delta", "new block", 1), 20000);
  m.record(delta("text_delta", "a".repeat(40), 1), 21000);
  m.record({ type: "text_end", contentIndex: 1 }, 22000);
  m.record(delta("text_delta", "next block", 1), 40000);
  m.record(delta("text_delta", "a".repeat(40), 1), 41000);
  assert.ok(m.outputRate > 0 && m.outputRate < 2);
});

test("short, empty, buffered and tool-only responses have no rate", () => {
  for (const kind of ["empty", "single", "short", "buffered", "tool"]) {
    const m = new ResponseMetrics();
    m.start(0);
    if (kind !== "empty") m.record(delta(kind === "tool" ? "toolcall_delta" : "text_delta", "a".repeat(100)), 1000);
    if (kind === "short") m.record(delta("text_delta", "abcd"), 1100);
    if (kind === "buffered") m.record(delta("text_delta", "abcd"), 1000);
    m.finish("stop");
    assert.equal(m.outputRate, undefined, kind);
    assert.equal(m.labels()[1], "Out —", kind);
  }
});

test("output stays visible during thinking, while waiting has no stale rate", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("thinking_delta", "first"), 1000);
  m.record(delta("thinking_delta", "a".repeat(40)), 2000);
  assert.deepEqual(m.labels(), ["TTFT 1.00s", "Out ~10 tok/s"]);
  m.start(3000);
  assert.deepEqual(m.labels(), ["TTFT …", "Out — (waiting)"]);
});

test("a retry/new request clears all previous samples", () => {
  const m = new ResponseMetrics();
  m.start(0);
  m.record(delta("text_delta", "first"), 1000);
  m.record(delta("text_delta", "abcd"), 2000);
  m.start(10000);
  assert.deepEqual(m.labels(), ["TTFT …", "Out — (waiting)"]);
  assert.equal(m.outputRate, undefined);
  m.record(delta("thinking_delta", "new"), 10500);
  assert.equal(m.ttftSeconds, 0.5);
});

for (const reason of ["aborted", "error"]) {
  test(`${reason} is not presented as a completed sample`, () => {
    const m = new ResponseMetrics();
    m.start(0);
    m.record(delta("text_delta", "first"), 1000);
    m.record(delta("text_delta", "a".repeat(40)), 2000);
    m.finish(reason);
    m.record(delta("text_delta", "late"), 4000);
    assert.equal(m.labels()[1], `Out — (${reason})`);
    assert.equal(m.outputRate, 10);
  });
}

test("Unicode estimates are chunk-independent and CJK-aware", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("中文かなカナ한글"), 8);
  assert.equal(estimateTokens("😀"), 0.25);
  assert.equal(estimateTokens("hello 中文"), estimateTokens("hello ") + estimateTokens("中文"));
});

function harness(t, mode = "tui") {
  const events = new Map();
  const statuses = new Map();
  const writes = [];
  const timers = new Map();
  let now = 0;
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setInterval", (callback, interval) => {
    assert.equal(interval, 250);
    const handle = { unref() {} };
    timers.set(handle, callback);
    return handle;
  });
  t.mock.method(globalThis, "clearInterval", handle => { timers.delete(handle); });
  const ctx = { mode, ui: { setStatus: (key, text) => { statuses.set(key, text); writes.push([key, text]); } } };
  extension({ on: (name, handler) => events.set(name, handler) });
  const emit = (name, event = {}, time = now) => { now = time; return events.get(name)?.(event, ctx); };
  const output = (type, text, time) => emit("message_update", {
    message: { role: "assistant" }, assistantMessageEvent: delta(type, text),
  }, time);
  const tick = time => { now = time; for (const callback of [...timers.values()]) callback(); };
  return { events, statuses, writes, emit, output, timers, tick };
}

test("integration: request boundary, tool isolation, follow-up reset and final usage", t => {
  const h = harness(t);
  h.emit("session_start");
  h.emit("before_provider_request", {}, 100);
  h.output("text_delta", "outside turn", 200);
  assert.equal(h.statuses.get(TTFT_KEY), "TTFT —");
  h.emit("turn_start", {}, 1000);
  h.emit("before_provider_request", {}, 5000);
  h.output("text_delta", "first", 6000);
  h.output("text_delta", "a".repeat(40), 7000);
  h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse", usage: { output: 1000000 } } }, 9000);
  assert.equal(h.statuses.get(TTFT_KEY), "TTFT 1.00s");
  assert.equal(h.statuses.get(OUTPUT_KEY), "Out ~10 tok/s");
  h.emit("tool_execution_start", { toolCallId: "a" }, 10000);
  h.emit("tool_execution_start", { toolCallId: "b" }, 11000);
  h.emit("tool_execution_update", { partialResult: "a".repeat(10000) }, 12000);
  h.emit("tool_execution_end", { toolCallId: "a" }, 20000);
  assert.equal(h.statuses.get(OUTPUT_KEY), "Out ~10 tok/s");
  h.emit("message_end", { message: { role: "toolResult" } }, 21000);
  h.emit("tool_execution_end", { toolCallId: "b" }, 30000);
  h.emit("turn_end", { outcome: "completed" }, 30000);
  h.emit("turn_start", {}, 40000);
  assert.equal(h.statuses.get(TTFT_KEY), "TTFT …");
  h.emit("before_provider_request", {}, 45000);
  h.output("thinking_delta", "reasoning", 45500);
  assert.equal(h.statuses.get(TTFT_KEY), "TTFT 0.50s");
  assert.equal(h.statuses.get(OUTPUT_KEY), "Out — (thinking)");
});

test("phase changes and final values bypass render throttling", t => {
  const h = harness(t);
  h.emit("turn_start");
  h.emit("before_provider_request");
  h.output("text_delta", "first", 100);
  h.output("text_delta", "a".repeat(40), 200);
  h.output("text_delta", "a".repeat(40), 300);
  h.output("text_delta", "a".repeat(40), 400);
  h.output("text_delta", "a".repeat(80), 500);
  h.emit("message_end", { message: { role: "assistant", stopReason: "stop" } }, 501);
  assert.equal(h.statuses.get(OUTPUT_KEY), "Out ~125 tok/s");
});

test("turn cancellation during tools is explicit", t => {
  const h = harness(t);
  h.emit("turn_start");
  h.emit("before_provider_request");
  h.emit("tool_execution_start");
  h.emit("turn_end", { outcome: "aborted" });
  assert.equal(h.statuses.get(OUTPUT_KEY), "Out — (aborted)");
});

for (const event of ["session_start", "model_select", "session_before_switch", "session_before_fork", "session_before_tree"]) {
  test(`${event} clears stale measurements`, t => {
    const h = harness(t);
    h.emit("turn_start");
    h.emit("before_provider_request");
    h.output("text_delta", "first", 1000);
    h.emit(event);
    assert.equal(h.statuses.get(TTFT_KEY), "TTFT —");
    assert.equal(h.statuses.get(OUTPUT_KEY), "Out —");
  });
}

test("non-TUI mode stays silent", t => {
  const h = harness(t, "json");
  h.emit("session_start");
  h.emit("turn_start");
  h.emit("before_provider_request");
  h.output("text_delta", "hello", 1000);
  h.emit("session_shutdown");
  assert.equal(h.writes.length, 0);
});

test("shutdown removes only the owned chips", t => {
  const h = harness(t);
  h.statuses.set("unrelated", "keep");
  h.emit("session_start");
  h.emit("session_shutdown");
  assert.deepEqual(h.writes.slice(-4), [TTFT_KEY, OUTPUT_KEY, REQUEST_KEY, TOOL_KEY].map(key => [key, undefined]));
  assert.equal(h.statuses.get("unrelated"), "keep");
});

test("CC owns the footer and all metrics are configured on line three", () => {
  const config = JSON.parse(readFileSync(new URL("../.pi/agent/pi-cc-extensions.json", import.meta.url), "utf8"));
  assert.equal(config.enableCustomFooter, true);
  assert.deepEqual(config.footerLine3Keys, [TTFT_KEY, OUTPUT_KEY, REQUEST_KEY, TOOL_KEY]);
  assert.equal(existsSync(new URL("../.pi/agent/extensions/statusline.ts", import.meta.url)), false);
});

test("request duration includes TTFT, thinking and completion tail but freezes before tools", () => {
  const m = new ResponseMetrics();
  assert.equal(m.requestLabel(0), "Req —");
  m.start(1000);
  assert.equal(m.requestLabel(3000), "Req ▸2.0s");
  m.record(delta("thinking_delta", "thinking"), 4000);
  m.record(delta("text_delta", "first", 1), 6000);
  m.record(delta("text_delta", "abcd", 1), 7000);
  m.finish("stop", 9000);
  assert.equal(m.requestLabel(20000), "Req 8.0s");
  m.tool(21000);
  m.finish("aborted", 30000);
  assert.equal(m.requestLabel(40000), "Req 8.0s");
  m.start(50000);
  assert.equal(m.requestLabel(51000), "Req ▸1.0s");
  m.finish("error", 52000);
  assert.equal(m.requestLabel(60000), "Req !2.0s");
});

test("parallel tools use batch wall time, not the sum of individual durations", () => {
  const tools = new ToolMetrics();
  assert.equal(tools.label(0), undefined);
  tools.start("a", 1000);
  tools.start("b", 2000);
  tools.end("a", 4000, false);
  assert.equal(tools.active, true);
  assert.equal(tools.label(5000), "Tool ▸4.0s");
  tools.end("b", 6000, false);
  assert.equal(tools.label(10000), "Tool 5.0s");
  assert.equal(tools.active, false);
});

test("sequential siblings include scheduling gaps, but new batches reset", () => {
  const tools = new ToolMetrics();
  tools.start("a", 1000);
  tools.end("a", 2000, false);
  tools.start("b", 3000);
  tools.end("b", 4000, false);
  assert.equal(tools.label(5000), "Tool 3.0s");
  tools.reset();
  tools.start("c", 10000);
  tools.end("c", 11000, false);
  assert.equal(tools.label(20000), "Tool 1.0s");
});

test("unknown/duplicate ends are ignored and failures remain highlighted", () => {
  const tools = new ToolMetrics();
  tools.end("unknown", 1000, true);
  assert.equal(tools.label(2000), undefined);
  tools.start("a", 3000);
  tools.start("a", 3500);
  tools.start("b", 4000);
  tools.end("a", 5000, true);
  tools.end("a", 6000, false);
  assert.equal(tools.label(7000), "Tool !▸4.0s");
  tools.cancel(8000);
  tools.end("b", 20000, false);
  assert.equal(tools.label(30000), "Tool !5.0s");
});

test("request timer refreshes even without deltas and stops on completion", t => {
  const h = harness(t);
  assert.equal(h.timers.size, 0);
  h.emit("turn_start", {}, 1000);
  assert.equal(h.timers.size, 0);
  h.emit("before_provider_request", {}, 2000);
  assert.equal(h.timers.size, 1);
  h.tick(3500);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req ▸1.5s");
  h.emit("before_provider_request", {}, 4000);
  assert.equal(h.timers.size, 1);
  h.tick(5000);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req ▸1.0s");
  h.emit("message_end", { message: { role: "assistant", stopReason: "stop" } }, 6000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req 2.0s");
  h.tick(10000);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req 2.0s");
});

test("tool timer follows the entire batch and preserves the result during follow-up", t => {
  const h = harness(t);
  h.emit("agent_start");
  h.emit("turn_start");
  h.emit("before_provider_request");
  h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse" } }, 1000);
  h.emit("tool_execution_start", { toolCallId: "a" }, 2000);
  h.emit("tool_execution_start", { toolCallId: "b" }, 3000);
  h.emit("tool_execution_end", { toolCallId: "a", isError: false }, 4000);
  assert.equal(h.timers.size, 1);
  h.tick(6000);
  assert.equal(h.statuses.get(TOOL_KEY), "Tool ▸4.0s");
  assert.equal(h.statuses.get(REQUEST_KEY), "Req 1.0s");
  h.emit("tool_execution_end", { toolCallId: "b", isError: false }, 7000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.statuses.get(TOOL_KEY), "Tool 5.0s");
  h.emit("turn_end", { outcome: "completed" }, 8000);
  h.emit("turn_start", {}, 9000);
  h.emit("before_provider_request", {}, 10000);
  h.tick(11000);
  assert.equal(h.statuses.get(TOOL_KEY), "Tool 5.0s");
  h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse" } }, 12000);
  h.emit("tool_execution_start", { toolCallId: "c" }, 13000);
  h.tick(14000);
  assert.equal(h.statuses.get(TOOL_KEY), "Tool ▸1.0s");
  h.emit("tool_execution_end", { toolCallId: "c", isError: true }, 15000);
  assert.equal(h.statuses.get(TOOL_KEY), "Tool !2.0s");
  h.emit("turn_end", { outcome: "completed" });
  h.emit("agent_start");
  assert.equal(h.statuses.get(TOOL_KEY), undefined);
});

test("cancellation freezes unfinished request/tool timing and clears timers", t => {
  const h = harness(t);
  h.emit("turn_start");
  h.emit("before_provider_request");
  h.emit("turn_end", { outcome: "aborted" }, 3000);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req !3.0s");
  assert.equal(h.timers.size, 0);
  h.emit("turn_start", {}, 4000);
  h.emit("before_provider_request");
  h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse" } }, 5000);
  h.emit("tool_execution_start", { toolCallId: "a" }, 6000);
  h.emit("turn_end", { outcome: "aborted" }, 8000);
  assert.equal(h.statuses.get(REQUEST_KEY), "Req 1.0s");
  assert.equal(h.statuses.get(TOOL_KEY), "Tool !2.0s");
  assert.equal(h.timers.size, 0);
});

for (const event of ["session_start", "agent_start", "model_select", "session_before_switch", "session_before_fork", "session_before_tree", "session_shutdown"]) {
  test(`${event} stops timers and removes stale tool duration`, t => {
    const h = harness(t);
    h.emit("turn_start");
    h.emit("before_provider_request");
    h.emit("message_end", { message: { role: "assistant", stopReason: "toolUse" } }, 1000);
    h.emit("tool_execution_start", { toolCallId: "a" }, 2000);
    assert.equal(h.timers.size, 1);
    h.emit(event, {}, 3000);
    assert.equal(h.timers.size, 0);
    assert.equal(h.statuses.get(TOOL_KEY), undefined);
  });
}

test("non-TUI mode starts no timers", t => {
  const h = harness(t, "json");
  h.emit("turn_start");
  h.emit("before_provider_request");
  assert.equal(h.timers.size, 0);
  h.emit("tool_execution_start", { toolCallId: "a" });
  assert.equal(h.timers.size, 0);
  assert.equal(h.writes.length, 0);
});
