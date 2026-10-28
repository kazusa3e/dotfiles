import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const root = process.env.PI_PACKAGE_ROOT;
if (!root) throw new Error("Set PI_PACKAGE_ROOT to the installed pi package directory");
const { createJiti } = await import(pathToFileURL(`${root}/node_modules/jiti/lib/jiti.mjs`));
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-coding-agent": `${root}/dist/index.js` } });
const { default: extension, titleContext, normalizeTitle } = await jiti.import("../.pi/agent/extensions/session-title.ts");
const entry = (id, parentId, content) => ({ id, parentId, type: "message", timestamp: "2026-01-01", message: { role: "user", content, timestamp: 0 } });
const assistant = (id, parentId, content) => ({ ...entry(id, parentId, content), message: { role: "assistant", content: [{ type: "text", text: content }], stopReason: "stop", timestamp: 0 } });
const tool = (id, parentId, toolName, content, isError = false) => ({ ...entry(id, parentId, content), message: { role: "toolResult", toolName, toolCallId: id, content: [{ type: "text", text: content }], isError, timestamp: 0 } });
const skill = (args = "") => `<skill name="review" location="/private/skills/review/SKILL.md">\nReferences are relative to /private/skills/review.\n\n${"Skill instructions. ".repeat(200)}\n</skill>${args ? `\n\n${args}` : ""}`;
const records = context => JSON.parse(context.messages[0].content);
const response = { stopReason: "stop", content: [{ type: "text", text: "Fix Pi session titles polluted by skill instructions." }] };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(result = async () => response) {
  const events = new Map();
  const commands = new Map();
  let name;
  const notifications = [];
  const requests = [];
  const pi = {
    on: (event, fn) => events.set(event, fn),
    registerCommand: (name, command) => commands.set(name, command),
    getSessionName: () => name,
    setSessionName: value => { name = value; },
  };
  const ctx = {
    hasUI: true, ui: { notify: (...args) => notifications.push(args) },
    model: {}, waitForIdle: async () => {},
    entries: [entry("a", null, "Fix Pi session titles polluted by skill paths")],
    sessionId: "session",
    sessionManager: { getSessionId: () => ctx.sessionId, getBranch: () => ctx.entries },
    modelRegistry: {
      hasConfiguredAuth: () => true,
      streamSimple: (model, context, options) => {
        const request = { model, context, options };
        requests.push(request);
        return { result: () => result(request, requests.length) };
      },
    },
  };
  extension(pi);
  return {
    events, commands, ctx, pi, notifications, requests,
    retitle: () => commands.get("retitle").handler("", ctx),
    settle: async () => { events.get("agent_settled")({}, ctx); await tick(); },
  };
}

test("normalization preserves complete sentences, newlines and Unicode without hard truncation", () => {
  assert.equal(normalizeTitle('\n标题："Fix session titles\nwithout losing task details."'), "Fix session titles without losing task details.");
  assert.equal(normalizeTitle("“修复 Pi 标题生成时被 skill 路径污染的问题。”"), "修复 Pi 标题生成时被 skill 路径污染的问题。");
  assert.equal(normalizeTitle("😀".repeat(100)), "😀".repeat(100));
  assert.equal(normalizeTitle("  "), undefined);
});

test("normalization preserves issue references and punctuation in technical identifiers", () => {
  for (const title of ["#1234：修复 api.ts 的 HTTP 429 重试。", "修复 C#", "_retry 的取消处理有误。", "修复 operator*"]) {
    assert.equal(normalizeTitle(title), title);
  }
  assert.equal(normalizeTitle("## 修复 C#"), "修复 C#");
  assert.equal(normalizeTitle("**修复 _retry 的 HTTP 429 重试。**"), "修复 _retry 的 HTTP 429 重试。");
});

test("title rules shorten prose while preserving relevant technical identifiers exactly", () => {
  const text = "讨论 OAuth2、api.ts、_retry、/retitle、v1.2.3、HTTP 429 和 #1234。";
  const context = titleContext([entry("a", null, text)]);
  assert.equal(records(context)[0].text, text);
  assert.match(context.systemPrompt, /about 20 Chinese characters or about 10 English words/);
  assert.match(context.systemPrompt, /the hard limit is not a target/);
  assert.match(context.systemPrompt, /Summarize the session as a whole/);
  assert.match(context.systemPrompt, /not just the latest request or final few turns/);
  assert.match(context.systemPrompt, /Do not let routine final checks or minor follow-ups replace the session's main subject/);
  assert.match(context.systemPrompt, /at most 72 Unicode characters/);
  assert.match(context.systemPrompt, /Preserve relevant technical identifiers exactly/);
  assert.match(context.systemPrompt, /filenames, code symbols, commands, versions, HTTP status codes, and issue\/PR references/);
  assert.match(context.systemPrompt, /Never translate, recase, or abbreviate identifiers; shorten the surrounding prose instead/);
  assert.match(context.systemPrompt, /Omit secondary actions and redundant outcomes/);
});

test("skill arguments survive long instructions and no skill metadata is sent", () => {
  const context = titleContext([entry("a", null, skill("Review the title plugin's cancellation handling"))]);
  assert.deepEqual(records(context), [{ role: "user", text: "Review the title plugin's cancellation handling" }]);
  assert.doesNotMatch(JSON.stringify(context), /\/private\/|Skill instructions|References are relative/);
});

test("skill-only messages are skipped in favor of the first actual task", () => {
  assert.equal(titleContext([entry("a", null, skill())]), undefined);
  const context = titleContext([entry("a", null, skill()), assistant("b", "a", "Skill loaded"), entry("c", "b", "Fix title generation")]);
  assert.deepEqual(records(context), [{ role: "user", text: "Fix title generation" }]);
});

test("unexpanded skill commands use only arguments", () => {
  assert.equal(titleContext([entry("a", null, "/skill:review")]), undefined);
  assert.deepEqual(records(titleContext([entry("a", null, "/skill:review Check session-title cancellation")])), [
    { role: "user", text: "Check session-title cancellation" },
  ]);
});

test("both title paths redact secrets without changing stored messages", async () => {
  for (const manual of [true, false]) {
    const h = harness();
    const secret = "TOKEN=secret Bearer private-value sk-123456789012345678901234";
    h.ctx.entries = [entry("a", null, skill(`Fix auth handling ${secret}`)), assistant("b", "a", "PASSWORD=secret"), tool("c", "b", "bash", "API_KEY=secret")];
    const original = structuredClone(h.ctx.entries);
    if (manual) await h.retitle(); else await h.settle();
    const content = h.requests[0].context.messages[0].content;
    assert.doesNotMatch(content, /private-value|sk-123|=secret/);
    assert.match(content, /redacted/);
    assert.deepEqual(h.ctx.entries, original);
  }
});

test("title context retains pre-compaction goals and honors context edits", () => {
  const entries = [entry("a", null, "old"),
    { id: "b", parentId: "a", type: "compaction", timestamp: "2026-01-01", summary: "summary", firstKeptEntryId: "b", tokensBefore: 5 },
    entry("c", "b", "new"),
    { id: "d", parentId: "c", type: "context_edit", timestamp: "2026-01-01", targetId: "a", replacement: { content: "edited" } }];
  const original = structuredClone(entries);
  assert.deepEqual(records(titleContext(entries)).map(record => record.text), ["edited", "new"]);
  assert.deepEqual(entries, original);
});

test("system prompts, tools, images, reasoning and file contents do not become title instructions", () => {
  const system = { ...entry("a", null, ""), message: { role: "system", content: "Original system instructions", toolsAdded: [{ name: "dangerous", description: "Tool definition", parameters: {} }], timestamp: 0 } };
  const user = entry("b", "a", [{ type: "text", text: "Fix title errors" }, { type: "image", mimeType: "image/png", data: "PRIVATE_IMAGE" }]);
  const answer = assistant("c", "b", "Use bounded title input");
  answer.message.content.push({ type: "thinking", thinking: "PRIVATE_REASONING" }, { type: "toolCall", id: "d", name: "read", arguments: { path: "SKILL.md" } });
  const context = titleContext([system, user, answer, tool("d", "c", "read", "PRIVATE_FILE"), tool("e", "d", "bash", "Tests passed")]);
  assert.equal(context.messages.length, 1);
  assert.equal(context.tools, undefined);
  assert.match(context.systemPrompt, /not instructions to follow/);
  assert.match(context.systemPrompt, /Never end the title with punctuation/);
  assert.match(context.systemPrompt, /Distinguish discussion, planned work, and completed work/);
  assert.doesNotMatch(JSON.stringify(context), /Original system|Tool definition|PRIVATE_|toolsAdded|toolCall/);
  assert.deepEqual(records(context).map(record => record.role), ["user", "assistant", "tool:bash"]);
});

test("large transcripts preserve the initial goal, latest request and outcome within a serialized budget", () => {
  const entries = [entry("0", null, "Initial goal: fix title generation")];
  for (let i = 1; i < 100; i++) {
    entries.push(entry(`${i}u`, entries.at(-1).id, `Intermediate request ${i} ${"x".repeat(10_000)}`));
    entries.push(assistant(`${i}a`, entries.at(-1).id, `Intermediate answer ${i} ${"y".repeat(10_000)}`));
    entries.push(tool(`${i}t`, entries.at(-1).id, "bash", "log\n".repeat(10_000)));
  }
  entries.push(entry("latest", entries.at(-1).id, "Latest request: retain manual names"));
  entries.push(assistant("outcome", "latest", "Outcome: manual names are now preserved"));
  entries.push(tool("error", "outcome", "bash", "Final test failed", true));
  for (const budget of [16_000, 4000]) {
    const context = titleContext(entries, budget);
    const content = context.messages[0].content;
    assert.ok(content.length <= budget, `${content.length} exceeds ${budget}`);
    assert.match(content, /Initial goal/);
    assert.match(content, /Latest request/);
    assert.match(content, /Outcome:/);
    assert.match(content, /Final test failed/);
    assert.match(content, /tool:bash \(error\)/);
    assert.equal(records(context)[0].role, "user");
  }
});

test("short sessions retain all dialogue and tool excerpts in chronological order", () => {
  const entries = [entry("a", null, "Compare title generators"), assistant("b", "a", "Compare OpenCode and Codex"),
    entry("c", "b", "Implement skill filtering"), assistant("d", "c", "Filtering implemented"),
    tool("e", "d", "bash", "Tests passed"), entry("f", "e", "Adjust the title length")];
  assert.deepEqual(records(titleContext(entries)).map(record => record.text), [
    "Compare title generators", "Compare OpenCode and Codex", "Implement skill filtering",
    "Filtering implemented", "Tests passed", "Adjust the title length",
  ]);
});

test("long-session titles cover every stage even after a smaller-context retry", async () => {
  const h = harness(async (_request, call) => call === 1 ? { stopReason: "error", errorMessage: "prompt is too long", content: [] } : response);
  const stages = ["DISCOVERY", "IMPLEMENTATION", "VERIFICATION"];
  const entries = [];
  for (const stage of stages) {
    for (let i = 0; i < 20; i++) {
      const id = `${stage}-${i}`;
      entries.push(entry(`${id}-u`, entries.at(-1)?.id ?? null, `${stage} ${i} user task: ${"details ".repeat(600)}`));
      entries.push(assistant(`${id}-a`, `${id}-u`, `${stage} ${i} assistant result: ${"result ".repeat(600)}`));
      entries.push(tool(`${id}-t`, `${id}-a`, "bash", `${stage} ${i} tool result: ${"output ".repeat(600)}`));
    }
  }
  entries.push(entry("last", entries.at(-1).id, "Minor follow-up: adjust punctuation"));
  h.ctx.entries = entries;
  await h.retitle();
  assert.equal(h.requests.length, 2);
  for (const [index, request] of h.requests.entries()) {
    assert.ok(request.context.messages[0].content.length <= (index === 0 ? 16_000 : 4000));
    const selected = records(request.context);
    for (const stage of stages) {
      for (const role of ["user", "assistant", "tool:bash"]) {
        assert.ok(selected.some(record => record.role === role && record.text.startsWith(stage)), `Missing ${stage} ${role}`);
      }
    }
    const positions = selected.map(record => entries.findIndex(item =>
      (typeof item.message.content === "string" ? item.message.content : item.message.content[0].text).startsWith(record.text.split("\n")[0])));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.match(selected.at(-1).text, /adjust punctuation/);
  }
});

test("ordinary user requests throughout the session survive verbose assistant replies", () => {
  const entries = [];
  for (let i = 0; i < 80; i++) {
    entries.push(entry(`${i}-u`, entries.at(-1)?.id ?? null, `Task ${i}: improve the session title plugin`));
    entries.push(assistant(`${i}-a`, `${i}-u`, "Verbose assistant explanation ".repeat(300)));
  }
  const selected = records(titleContext(entries));
  assert.deepEqual(selected.filter(record => record.role === "user").map(record => record.text),
    entries.filter(item => item.message.role === "user").map(item => item.message.content));
  assert.ok(selected.some(record => record.role === "assistant"));
});

test("escaping and wide Unicode characters cannot exceed the serialized input budget", () => {
  for (const text of ["\u0001".repeat(30_000), "😀".repeat(30_000)]) {
    const context = titleContext([entry("a", null, `Initial ${text} end`), entry("b", "a", "Latest task")], 4000);
    const content = context.messages[0].content;
    assert.ok(content.length <= 4000);
    assert.match(content, /Initial/);
    assert.match(content, /Latest task/);
    assert.doesNotMatch(records(context)[0].text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  }
});

test("retitle uses an isolated title request and registers no extra commands", async () => {
  const h = harness();
  assert.deepEqual([...h.commands.keys()], ["retitle"]);
  await h.retitle();
  assert.equal(h.pi.getSessionName(), response.content[0].text);
  const { context, options } = h.requests[0];
  assert.equal(context.messages[0].role, "user");
  assert.equal(options.cacheRetention, "short");
  assert.equal(options.sessionId, "session:title");
  assert.equal(options.maxRetries, 0);
  assert.equal(options.maxTokens, 1024);
});

test("a complete title within the 72-character limit is preserved", async () => {
  const title = "修复 Pi 会话标题被 skill 路径污染的问题，保留具体任务信息，并让手动重新命名在上下文过长时缩减输入后重试。";
  assert.ok(Array.from(title).length <= 72);
  const h = harness(async () => ({ ...response, content: [{ type: "text", text: title }] }));
  await h.retitle();
  assert.equal(h.pi.getSessionName(), title);
  assert.equal(h.requests.length, 1);
});

test("the 72-character limit counts Unicode characters rather than UTF-16 units", async () => {
  const title = "😀".repeat(71) + "。";
  const h = harness(async () => ({ ...response, content: [{ type: "text", text: title }] }));
  await h.retitle();
  assert.equal(h.pi.getSessionName(), title);
  assert.equal(h.requests.length, 1);
});

test("overlong titles are rewritten rather than cut off", async () => {
  const h = harness(async (_request, call) => call === 1 ? { ...response, content: [{ type: "text", text: "😀".repeat(73) }] } : response);
  await h.retitle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.pi.getSessionName(), response.content[0].text);
  assert.match(h.requests[1].context.systemPrompt, /Rewrite as a shorter title.*no-terminal-punctuation/);
  assert.deepEqual(h.requests[1].context.messages, h.requests[0].context.messages);
});

test("context overflow gets one smaller-input retry with the same initial goal and latest task", async () => {
  const h = harness(async (_request, call) => call === 1 ? { stopReason: "error", errorMessage: "maximum context length exceeded", content: [] } : response);
  h.ctx.entries = [entry("a", null, `Initial goal ${"x".repeat(20_000)}`), assistant("b", "a", "y".repeat(20_000)), entry("c", "b", "Latest task"), assistant("d", "c", "Latest outcome")];
  await h.retitle();
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests[1].context.messages[0].content.length < h.requests[0].context.messages[0].content.length);
  assert.ok(h.requests[1].context.messages[0].content.length <= 4000);
  assert.match(h.requests[1].context.messages[0].content, /Initial goal/);
  assert.match(h.requests[1].context.messages[0].content, /Latest task/);
  assert.equal(h.pi.getSessionName(), response.content[0].text);
});

for (const [label, fail] of [
  ["thrown network failure", () => { throw new TypeError("fetch failed"); }],
  ["returned rate limit", () => ({ stopReason: "error", errorMessage: "429 API key rate limit reached", content: [] })],
]) {
  test(`${label} gets one delayed retry`, async () => {
    const h = harness(async (_request, call) => call === 1 ? fail() : response);
    await h.retitle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.pi.getSessionName(), response.content[0].text);
    assert.deepEqual(h.requests[1].context, h.requests[0].context);
  });
}

for (const [error, category] of [
  [Object.assign(new Error("Rejected Bearer secret-token"), { status: 401 }), "authentication unavailable or rejected"],
  [new Error("insufficient_quota TOKEN=secret"), "quota or billing limit reached"],
  [new Error("Unknown failure containing PASSWORD=secret"), "provider request failed"],
  [Object.assign(new Error("Unsupported parameter containing TOKEN=secret"), { status: 400 }), "invalid request or unsupported model settings"],
]) {
  test(`${category} fails without retry and never leaks provider details`, async () => {
    const h = harness(async () => { throw error; });
    h.pi.setSessionName("Existing");
    await h.retitle();
    assert.equal(h.pi.getSessionName(), "Existing");
    assert.equal(h.requests.length, 1);
    assert.equal(h.notifications[0][1], "warning");
    assert.ok(h.notifications[0][0].includes(category));
    assert.doesNotMatch(h.notifications[0][0], /secret|Bearer|PASSWORD|TOKEN/);
  });
}

for (const [badResponse, category] of [
  [{ stopReason: "stop", content: [] }, "empty title"],
  [{ stopReason: "length", content: [{ type: "text", text: "Incomplete" }] }, "output token limit"],
  [{ stopReason: "stop", content: [{ type: "toolCall", name: "bash" }] }, "tool call"],
  [{ stopReason: "stop", content: [{ type: "text", text: "x".repeat(73) }] }, "length limit"],
  [{ stopReason: "error", content: [], errorMessage: "prompt is too long" }, "context limit"],
  [{ stopReason: "aborted", content: [] }, "cancelled by provider"],
]) {
  test(`persistent ${category} preserves the title and reports the category`, async () => {
    const h = harness(async () => badResponse);
    h.pi.setSessionName("Existing");
    await h.retitle();
    assert.equal(h.pi.getSessionName(), "Existing");
    assert.equal(h.requests.length, badResponse.stopReason === "aborted" ? 1 : 2);
    assert.ok(h.notifications[0][0].includes(category));
  });
}

test("missing authentication is reported before making a request", async () => {
  const h = harness();
  h.ctx.modelRegistry.hasConfiguredAuth = () => false;
  await h.retitle();
  assert.equal(h.requests.length, 0);
  assert.match(h.notifications[0][0], /authentication/);
});

test("the total deadline aborts the request, preserves the title and reports timeout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(({ options }) => new Promise(resolve => {
    options.signal.addEventListener("abort", () => resolve({ stopReason: "aborted", content: [] }), { once: true });
  }));
  h.pi.setSessionName("Existing");
  const task = h.retitle();
  await tick();
  t.mock.timers.tick(60_000);
  await task;
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.pi.getSessionName(), "Existing");
  assert.match(h.notifications[0][0], /request timed out/);
  assert.equal(h.requests.length, 1);
});

test("skill-only startup is deferred and the first real task is named only once", async () => {
  const h = harness();
  h.ctx.entries = [entry("a", null, skill())];
  await h.settle();
  assert.equal(h.requests.length, 0);
  assert.equal(h.pi.getSessionName(), undefined);
  assert.equal(h.notifications.length, 0);
  h.ctx.entries.push(entry("b", "a", "Fix title generation"), assistant("c", "b", "Implemented skill filtering"));
  await h.settle();
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].context.messages[0].content, /Implemented skill filtering/);
  assert.equal(h.pi.getSessionName(), response.content[0].text);
  await h.settle();
  assert.equal(h.requests.length, 1);
});

test("manual retitle with no actual task makes no request", async () => {
  const h = harness();
  h.ctx.entries = [entry("a", null, skill())];
  await h.retitle();
  assert.equal(h.requests.length, 0);
  assert.match(h.notifications[0][0], /No user task/);
});

test("existing names are never automatically retitled", async () => {
  const h = harness();
  h.pi.setSessionName("User's own title");
  await h.settle();
  assert.equal(h.requests.length, 0);
  assert.equal(h.pi.getSessionName(), "User's own title");
});

test("automatic failure reports a category, does not fall back to raw prompt text and does not loop", async () => {
  const h = harness(async () => { throw new Error("401 unauthorized"); });
  await h.settle();
  assert.equal(h.pi.getSessionName(), undefined);
  assert.match(h.notifications[0][0], /authentication/);
  await h.settle();
  assert.equal(h.requests.length, 1);
});

for (const change of ["session_before_tree", "session_before_switch", "session_before_fork", "session_shutdown", "model_select", "agent_start", "session_info_changed"]) {
  test(`${change} aborts and invalidates an in-flight result`, async () => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; }));
    const task = h.retitle();
    await tick();
    h.events.get(change)();
    assert.equal(h.requests[0].options.signal.aborted, true);
    resolve(response);
    await task;
    assert.equal(h.pi.getSessionName(), undefined);
    assert.equal(h.notifications.length, 0);
  });
}

test("cancellation during retry backoff prevents another provider request", async () => {
  const h = harness(async () => ({ stopReason: "error", errorMessage: "429 Too many requests", content: [] }));
  const task = h.retitle();
  await tick();
  h.events.get("agent_start")();
  await task;
  assert.equal(h.requests.length, 1);
  assert.equal(h.notifications.length, 0);
});

test("a cancelled initial naming attempt may run again after the next task settles", async () => {
  let resolve;
  const h = harness((_request, call) => call === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(response));
  await h.settle();
  h.events.get("agent_start")();
  resolve(response);
  await tick();
  assert.equal(h.pi.getSessionName(), undefined);
  await h.settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.pi.getSessionName(), response.content[0].text);
});

test("manual retitle supersedes a pending initial title without accepting its stale result", async () => {
  let resolve;
  const h = harness((_request, call) => call === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(response));
  await h.settle();
  await h.settle();
  assert.equal(h.requests.length, 1);
  await h.retitle();
  assert.equal(h.requests[0].options.signal.aborted, true);
  resolve({ ...response, content: [{ type: "text", text: "Stale initial title" }] });
  await tick();
  assert.equal(h.pi.getSessionName(), response.content[0].text);
  assert.equal(h.requests.length, 2);
});

for (const change of ["name", "session"]) {
  test(`a changed ${change} invalidates a result even without a lifecycle event`, async () => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; }));
    const task = h.retitle();
    await tick();
    if (change === "name") h.pi.setSessionName("User's own title");
    else h.ctx.sessionId = "different-session";
    resolve(response);
    await task;
    assert.equal(h.pi.getSessionName(), change === "name" ? "User's own title" : undefined);
    assert.equal(h.notifications.length, 0);
  });
}

test("persistent network errors stop after one retry and preserve the original title", async () => {
  const h = harness(async () => ({ stopReason: "error", errorMessage: "503 Service temporarily unavailable", content: [] }));
  h.pi.setSessionName("Existing");
  await h.retitle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.pi.getSessionName(), "Existing");
  assert.match(h.notifications[0][0], /temporary provider or network failure/);
});

test("non-interactive mode generates titles without notifications", async () => {
  const h = harness();
  h.ctx.hasUI = false;
  await h.retitle();
  assert.equal(h.pi.getSessionName(), response.content[0].text);
  assert.equal(h.notifications.length, 0);
});
