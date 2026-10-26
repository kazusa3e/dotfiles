import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.env.PI_PACKAGE_ROOT;
if (!root) throw new Error("Set PI_PACKAGE_ROOT to the installed pi package directory");
// Exercise the primary extension even when this suite is launched by a worker.
delete process.env.PI_SUBAGENT_CHILD;
const { createJiti } = await import(pathToFileURL(`${root}/node_modules/jiti/lib/jiti.mjs`));
const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${root}/dist/index.js`,
		"@earendil-works/pi-ai": `${root}/node_modules/@earendil-works/pi-ai/dist/index.js`,
		"@earendil-works/pi-tui": `${root}/node_modules/@earendil-works/pi-tui/dist/index.js`,
	},
});
const { Container, stripTerminalSequences, visibleWidth } = await import(pathToFileURL(`${root}/node_modules/@earendil-works/pi-tui/dist/index.js`));
const { CustomMessageComponent, getMarkdownTheme, initTheme } = await import(pathToFileURL(`${root}/dist/index.js`));
const { theme } = await import(pathToFileURL(`${root}/dist/modes/interactive/theme/theme.js`));
const {
	default: extension,
	buildInjectedContent,
	buildStatusLines,
	DEFAULT_SUBAGENT_CONFIG,
	formatCompactToolCall,
	formatElapsed,
	formatTokens,
	normalizeSubagentConfig,
	parseKindPrefix,
	plainWidth,
	splitTrailingAmpersand,
	truncatePlain,
} = await jiti.import("../.pi/agent/extensions/subagent.ts");

const view = (partial) => ({
	kind: "worker",
	topic: "explore the codebase",
	status: "running",
	elapsedMs: 12_000,
	input: 3200,
	output: 400,
	spinner: "⠋",
	...partial,
});

test("splitTrailingAmpersand triggers on a trailing & and strips it", () => {
	assert.deepEqual(splitTrailingAmpersand("do x &"), { task: "do x", triggered: true });
	assert.deepEqual(splitTrailingAmpersand("do x"), { task: "do x", triggered: false });
	assert.deepEqual(splitTrailingAmpersand("do x   "), { task: "do x   ", triggered: false });
	assert.deepEqual(splitTrailingAmpersand("do x &\n"), { task: "do x", triggered: true });
});

test("splitTrailingAmpersand strips only the final ampersand", () => {
	assert.deepEqual(splitTrailingAmpersand("foo &&&"), { task: "foo &&", triggered: true });
	assert.deepEqual(splitTrailingAmpersand("run &&"), { task: "run &", triggered: true });
	assert.deepEqual(splitTrailingAmpersand("&&"), { task: "&", triggered: true });
});

test("splitTrailingAmpersand handles an ampersand-only message", () => {
	assert.deepEqual(splitTrailingAmpersand("&"), { task: "", triggered: true });
	assert.deepEqual(splitTrailingAmpersand("  &  \n"), { task: "", triggered: true });
});

test("splitTrailingAmpersand ignores & inside an unclosed fenced code block", () => {
	const pasted = "```\nconst x = a &\n";
	assert.deepEqual(splitTrailingAmpersand(pasted), { task: pasted, triggered: false });
	assert.deepEqual(splitTrailingAmpersand("summary:\n```\nfoo &\n"), {
		task: "summary:\n```\nfoo &\n",
		triggered: false,
	});
});

test("splitTrailingAmpersand triggers after a closed fenced code block", () => {
	const text = "```\nfoo &\n```\n&";
	assert.deepEqual(splitTrailingAmpersand(text), { task: "```\nfoo &\n```", triggered: true });
});

test("parseKindPrefix resolves known kinds and defaults unknown prefixes to worker", () => {
	assert.deepEqual(parseKindPrefix("worker:do x"), { kind: "worker", task: "do x" });
	assert.deepEqual(parseKindPrefix("do x"), { kind: "worker", task: "do x" });
	// Unknown kinds stay part of the task (future kinds can be added to the registry).
	assert.deepEqual(parseKindPrefix("scout:find auth"), { kind: "worker", task: "scout:find auth" });
	assert.deepEqual(parseKindPrefix("worker:  "), { kind: "worker", task: "" });
});

test("normalizeSubagentConfig applies independent nested display defaults", () => {
	assert.deepEqual(normalizeSubagentConfig({}), {
		...DEFAULT_SUBAGENT_CONFIG,
		display: { statusBar: "lines", toolCalls: "expanded", finalResponse: "expanded" },
	});
	assert.equal(normalizeSubagentConfig(undefined).maxConcurrent, 8);
	assert.equal(normalizeSubagentConfig(null).thinking, null);
	const first = normalizeSubagentConfig({ display: { statusBar: "hidden" } });
	const second = normalizeSubagentConfig({});
	assert.deepEqual(first.display, { statusBar: "hidden", toolCalls: "expanded", finalResponse: "expanded" });
	first.display.statusBar = "oneline";
	assert.equal(second.display.statusBar, "lines");
	assert.equal(normalizeSubagentConfig({ display: null }).display.toolCalls, "expanded");
	assert.equal(normalizeSubagentConfig({ display: "invalid" }).display.finalResponse, "expanded");
});

test("normalizeSubagentConfig validates nested modes and legacy aliases", () => {
	const config = normalizeSubagentConfig({
		maxConcurrent: 999,
		model: "  provider/model  ",
		thinking: "quantum",
		injectedToolCalls: "everything",
		display: { statusBar: "weird", toolCalls: "everything", finalResponse: null },
	});
	assert.equal(config.maxConcurrent, 64);
	assert.equal(config.model, "provider/model");
	assert.equal(config.thinking, "high");
	assert.deepEqual(config.display, { statusBar: "lines", toolCalls: "expanded", finalResponse: "expanded" });
	assert.equal(config.injectedToolCalls, "compact");

	const clamped = normalizeSubagentConfig({ maxConcurrent: 0 });
	assert.equal(clamped.maxConcurrent, 1);

	const configured = normalizeSubagentConfig({ display: { statusBar: "oneline", toolCalls: "never", finalResponse: "always" }, maxConcurrent: 3 });
	assert.deepEqual(configured.display, { statusBar: "oneline", toolCalls: "never", finalResponse: "always" });
	assert.equal(configured.maxConcurrent, 3);
	for (const [legacy, mode] of [["show", "always"], ["expanded", "expanded"], ["hidden", "never"]]) {
		assert.equal(normalizeSubagentConfig({ finalResponse: legacy }).display.finalResponse, mode);
	}
	assert.equal(normalizeSubagentConfig({ statusBar: "oneline" }).display.statusBar, "oneline");
	assert.deepEqual(normalizeSubagentConfig({
		statusBar: "hidden", finalResponse: "show", display: { statusBar: null, finalResponse: null },
	}).display, { statusBar: "lines", toolCalls: "expanded", finalResponse: "expanded" });
	assert.deepEqual(normalizeSubagentConfig({ statusBar: "hidden", finalResponse: "show", display: { statusBar: "lines", finalResponse: "never" } }).display,
		{ statusBar: "lines", toolCalls: "expanded", finalResponse: "never" });
});

test("formatTokens renders compact k/M units", () => {
	assert.equal(formatTokens(0), "0");
	assert.equal(formatTokens(999), "999");
	assert.equal(formatTokens(1234), "1.2k");
	assert.equal(formatTokens(12_000), "12k");
	assert.equal(formatTokens(2_000_000), "2.0M");
});

test("formatElapsed renders seconds and minutes", () => {
	assert.equal(formatElapsed(0), "0s");
	assert.equal(formatElapsed(12_300), "12s");
	assert.equal(formatElapsed(60_000), "1m0s");
	assert.equal(formatElapsed(125_000), "2m5s");
});

test("plainWidth counts wide characters as two columns", () => {
	assert.equal(plainWidth("abc"), 3);
	assert.equal(plainWidth("探索"), 4);
	assert.equal(plainWidth("a探索b"), 6);
});

test("truncatePlain cuts at the column budget with an ellipsis", () => {
	assert.equal(truncatePlain("abcdef", 4), "abc…");
	assert.equal(truncatePlain("abcdef", 10), "abcdef");
	assert.equal(truncatePlain("ab", 1), "…");
	assert.equal(truncatePlain("探索代码", 3), "探…");
	assert.equal(plainWidth(truncatePlain("探索代码", 3)), 3);
});

test("formatCompactToolCall renders one-line summaries", () => {
	assert.equal(
		formatCompactToolCall("bash", { command: "npm test --watch\n--verbose" }),
		"$ npm test --watch --verbose",
	);
	assert.equal(
		formatCompactToolCall("read", { file_path: "src/a.ts", offset: 10, limit: 20 }),
		"read src/a.ts:10-29",
	);
	assert.equal(formatCompactToolCall("read", { path: "/home/u/f.ts" }), "read /home/u/f.ts");
	assert.equal(
		formatCompactToolCall("write", { file_path: "out.md", content: "a\nb\nc" }),
		"write out.md (3 lines)",
	);
	assert.equal(formatCompactToolCall("write", { path: "x.txt", content: "done" }), "write x.txt");
	assert.equal(formatCompactToolCall("edit", { path: "x.txt" }), "edit x.txt");
	assert.equal(formatCompactToolCall("grep", { pattern: "auth", path: "src" }), "grep /auth/ in src");
	assert.equal(formatCompactToolCall("find", { pattern: "*.ts", path: "src" }), "find *.ts in src");
	// JSON-encoded string arguments are parsed.
	assert.equal(formatCompactToolCall("bash", '{"command":"ls"}'), "$ ls");
	// Unknown tools fall back to a truncated JSON preview: "webfetch " + 80 cols.
	const long = "x".repeat(200);
	assert.equal(formatCompactToolCall("webfetch", { url: long }).length, 89);
});

test("read summaries format optional line ranges and ignore malformed values", () => {
	for (const [offset, limit, range] of [
		[undefined, undefined, ""],
		[null, null, ""],
		[undefined, 20, ":1-20"],
		[null, "20", ":1-20"],
		[10, undefined, ":10"],
		["10", null, ":10"],
		[" 10 ", "20", ":10-29"],
		[1, 1, ":1-1"],
		["invalid", 20, ""],
		[10, "invalid", ""],
		["", 20, ""],
		[10, " ", ""],
		[NaN, 20, ""],
		[10, Infinity, ""],
		[false, 20, ""],
		[10, [], ""],
	]) {
		assert.equal(formatCompactToolCall("read", { path: "src/a.ts", offset, limit }), `read src/a.ts${range}`);
	}
});

test("buildInjectedContent renders success with compact tool calls", () => {
	const text = buildInjectedContent({
		kind: "worker",
		failed: false,
		turns: 3,
		usage: { input: 1200, output: 400, cost: 0.001 },
		elapsedMs: 12_300,
		finalText: "Found the auth module.",
		toolCalls: [{ name: "bash", args: { command: "ls src" } }, { name: "read", args: { file_path: "src/a.ts", offset: 1, limit: 40 } }],
		toolCallMode: "compact",
	});
	assert.ok(text.includes("[subagent worker] done"));
	assert.ok(text.includes("3 turns"));
	assert.ok(text.includes("↑1.2k ↓400"));
	assert.ok(text.includes("$0.0010"));
	assert.ok(text.includes("12s"));
	assert.ok(text.includes("→ $ ls src"));
	assert.ok(text.includes("→ read src/a.ts:1-40"));
	assert.ok(text.includes("Found the auth module."));
	assert.ok(text.indexOf("[subagent") < text.indexOf("→ $ ls"));
});

test("buildInjectedContent omits tool calls in none mode and reports empty output", () => {
	const text = buildInjectedContent({
		kind: "worker",
		failed: false,
		turns: 1,
		usage: { input: 100, output: 0, cost: 0 },
		elapsedMs: 2000,
		toolCalls: [{ name: "bash", args: { command: "ls" } }],
		toolCallMode: "none",
	});
	assert.ok(!text.includes("→ $ ls"));
	assert.ok(text.includes("(no output)"));
});

test("buildInjectedContent renders failures with the reason", () => {
	const text = buildInjectedContent({
		kind: "worker",
		failed: true,
		reason: "exit code 1",
		turns: 0,
		usage: { input: 0, output: 0, cost: 0 },
		elapsedMs: 1100,
		toolCalls: [],
		toolCallMode: "compact",
	});
	assert.ok(text.includes("[subagent worker] failed"));
	assert.ok(text.includes("→ exit code 1"));
	assert.ok(text.includes("1s"));
});

test("buildStatusLines renders one line per job with aligned columns", () => {
	const lines = buildStatusLines([view({}), view({ topic: "write tests", status: "queued", spinner: "·" })], {
		width: 80,
		mode: "lines",
	});
	assert.equal(lines.length, 2);
	assert.ok(lines[0].startsWith("#1 ⠋ worker"));
	assert.ok(lines[0].includes("explore the codebase"));
	assert.ok(lines[0].includes("↑3.2k ↓400"));
	assert.ok(lines[0].includes("12s"));
	assert.ok(lines[1].includes("write tests"));
	assert.ok(lines[1].startsWith("#2 · worker"));
	assert.ok(lines[1].includes("queued"));
	// Both lines fit the viewport exactly (topic padding absorbs the difference).
	assert.equal(plainWidth(lines[0]), 80);
	assert.equal(plainWidth(lines[1]), 80);
});

test("buildStatusLines oneline mode collapses all jobs into one line", () => {
	const lines = buildStatusLines(
		[view({ topic: "explore the codebase" }), view({ topic: "write tests" })],
		{ width: 60, mode: "oneline" },
	);
	assert.equal(lines.length, 1);
	assert.ok(lines[0].includes("explore the codebase"));
	assert.ok(lines[0].includes("write tests"));
	assert.ok(plainWidth(lines[0]) <= 60);
});

test("buildStatusLines truncates long topics and stays within the width budget", () => {
	const lines = buildStatusLines([view({ topic: "a".repeat(120) })], { width: 40, mode: "lines" });
	assert.ok(lines[0].includes("…"));
	assert.ok(plainWidth(lines[0]) <= 40);
});

test("buildStatusLines returns no lines for empty jobs or narrow terminals", () => {
	assert.deepEqual(buildStatusLines([], { width: 80, mode: "lines" }), []);
	assert.deepEqual(buildStatusLines([view({})], { width: 10, mode: "lines" }), []);
});

test("running widget renders through the TUI container and clears on completion", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	let finish;
	const runs = [];
	const run = options => {
		runs.push(options);
		return new Promise(resolve => { finish = resolve; });
	};

	const handlers = new Map();
	const sent = [];
	let widget;
	let placement;
	const pi = {
		on: (name, handler) => handlers.set(name, handler),
		registerCommand: () => {},
		registerTool: () => {},
		registerMessageRenderer: () => {},
		sendMessage: (...args) => sent.push(args),
	};
	const ctx = {
		mode: "tui", hasUI: true, cwd: "/tmp", thinkingLevel: "low", isIdle: () => true,
		model: { provider: "test", id: "test" },
		ui: {
			theme: { fg: (_token, text) => text },
			notify() {},
			setWidget: (_key, factory, options) => {
				widget = factory?.({ requestRender() {} }, ctx.ui.theme);
				placement = options?.placement;
			},
		},
	};
	extension(pi, run, { ...DEFAULT_SUBAGENT_CONFIG });
	t.after(() => handlers.get("session_shutdown")());
	handlers.get("session_start")({}, ctx);
	handlers.get("input")({ text: "inspect files &", source: "interactive" }, ctx);
	assert.equal(runs.length, 1);
	assert.equal(placement, "belowEditor");
	assert.ok(widget);
	const container = new Container();
	container.addChild(widget);
	const rows = container.render(80);
	assert.equal(rows.length, 1);
	assert.match(rows[0], /worker.*inspect files/);
	assert.match(rows[0], /#1 ⠋ worker/);
	const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	for (let tick = 0; tick <= frames.length; tick++) {
		const expected = `#1 ${frames[tick % frames.length]} worker`;
		assert.ok(container.render(80)[0].includes(expected));
		for (let message = 0; message < 20; message++) runs[0].onMessage({ role: "assistant", content: [] });
		widget.invalidate();
		assert.ok(container.render(80)[0].includes(expected), "worker output must not advance the spinner");
		t.mock.timers.tick(79);
		widget.invalidate();
		assert.ok(container.render(80)[0].includes(expected), "frames must last the full 80ms");
		t.mock.timers.tick(1);
		widget.invalidate();
		assert.ok(container.render(80)[0].includes(`#1 ${frames[(tick + 1) % frames.length]} worker`));
	}
	for (const width of [40, 80, 120]) {
		assert.doesNotThrow(() => container.render(width));
	}

	finish({
		exitCode: 0, aborted: false, stderr: "", turns: 1,
		usage: { input: 100, output: 20, cost: 0 },
		messages: [{ role: "assistant", content: [{ type: "text", text: "Done" }] }],
		stopReason: "stop",
	});
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(widget, undefined);
	assert.equal(sent.length, 1);
	assert.deepEqual(sent[0][1], { triggerTurn: true, deliverAs: "followUp" });
});

function toolHarness(t, config = {}, factory = extension) {
	const renderers = new Map();
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	const runs = [];
	const sent = [];
	const ctx = {
		mode: "json", hasUI: false, cwd: "/tmp", isIdle: () => true,
		model: { provider: "test-provider", id: "test-model" }, thinkingLevel: "low",
		ui: { notify() {} },
	};
	const pi = {
		on: (name, handler) => handlers.set(name, handler),
		registerCommand: (name, command) => commands.set(name, command),
		registerTool: tool => tools.set(tool.name, tool),
		registerMessageRenderer: (name, renderer) => renderers.set(name, renderer),
		sendMessage: (message, options) => sent.push({ message, options }),
	};
	factory(pi, options => new Promise((resolve, reject) => runs.push({ options, resolve, reject })), {
		...DEFAULT_SUBAGENT_CONFIG, ...config,
		display: { ...DEFAULT_SUBAGENT_CONFIG.display, ...config.display },
	});
	handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	return { handlers, commands, tools, renderers, runs, sent, ctx };
}

const completed = (text = "Done") => ({
	exitCode: 0, aborted: false, stderr: "", turns: 1,
	usage: { input: 100, output: 20, cost: 0 }, stopReason: "stop",
	messages: [{ role: "assistant", content: [{ type: "text", text }] }],
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test("busy subagent results share one boundary continuation and retain separate cards", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	for (const task of ["inspect A", "inspect B", "inspect C"]) {
		await h.tools.get("subagent").execute("call", { task }, undefined, undefined, h.ctx);
	}
	h.runs[1].resolve(completed("RESULT_B"));
	h.runs[0].resolve(completed("RESULT_A"));
	await flush();
	assert.equal(h.sent.length, 0);
	const boundary = h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx);
	assert.equal(boundary.continue, true);
	assert.deepEqual(boundary.entries.map(entry => entry.details.jobId), [2, 1]);
	assert.deepEqual(boundary.entries.map(entry => entry.details.task), ["inspect B", "inspect A"]);
	initTheme("dark", false);
	for (const entry of boundary.entries) {
		assert.equal(entry.type, "custom_message");
		assert.equal(entry.customType, "subagent-result");
		assert.equal(entry.display, true);
		assert.ok(h.renderers.get("subagent-result")(entry, { expanded: true, outputPad: 1 }, theme));
	}
	assert.equal(h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx), undefined);
	h.runs[2].resolve(completed("RESULT_C"));
	await flush();
	const next = h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx);
	assert.deepEqual(next.entries.map(entry => entry.details.jobId), [3]);
	assert.equal(next.continue, true);
});

test("batching leaves user input, delivery preferences, and the global queue untouched", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].resolve(completed());
	await flush();
	for (const streamingBehavior of ["steer", "followUp"]) {
		const event = { text: "user message", source: "interactive", streamingBehavior };
		assert.deepEqual(h.handlers.get("input")(event, h.ctx), { action: "continue" });
		assert.deepEqual(event, { text: "user message", source: "interactive", streamingBehavior });
	}
	const boundary = h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx);
	assert.equal(boundary.entries.length, 1);
	assert.equal(boundary.entries[0].customType, "subagent-result");
	assert.equal(h.sent.length, 0);
});

test("result batching preserves other extensions' boundary entries and continuation", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].resolve(completed());
	await flush();
	const existing = { type: "custom_message", customType: "another-extension", content: "PRESERVED", display: false };
	const boundary = h.handlers.get("agent_before_settle")({
		outcome: "error", entries: [existing], continue: true,
	}, h.ctx);
	assert.equal(boundary.entries[0], existing);
	assert.equal(boundary.entries[1].customType, "subagent-result");
	assert.equal(boundary.continue, true);
});

test("failed subagents join the same result batch", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	for (const task of ["success", "failure"]) {
		await h.tools.get("subagent").execute("call", { task }, undefined, undefined, h.ctx);
	}
	h.runs[0].resolve(completed("SUCCESS"));
	h.runs[1].resolve({ ...completed(), exitCode: 1, stopReason: "error", errorMessage: "FAILURE" });
	await flush();
	const boundary = h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx);
	assert.deepEqual(boundary.entries.map(entry => entry.details.failed), [false, true]);
	assert.match(boundary.entries[1].content, /FAILURE/);
	assert.equal(boundary.continue, true);
});

for (const outcome of ["aborted", "error"]) {
	test(`result batch does not restart the agent after ${outcome}`, async t => {
		const h = toolHarness(t);
		h.ctx.isIdle = () => false;
		await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
		h.runs[0].resolve(completed());
		await flush();
		const boundary = h.handlers.get("agent_before_settle")({ outcome }, h.ctx);
		assert.equal(boundary.entries.length, 1);
		assert.equal(boundary.continue, false);
		assert.equal(h.sent.length, 0);
	});
}

test("aborting preserves buffered results without waking the agent", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].resolve(completed("BUFFERED_RESULT"));
	await flush();
	h.handlers.get("agent_settled")({ aborted: true }, h.ctx);
	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0].options.triggerTurn, false);
	assert.match(h.sent[0].message.content, /BUFFERED_RESULT/);
	assert.equal(h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx), undefined);
});

test("results arriving at settlement trigger only one new run", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	for (const task of ["first", "second"]) {
		await h.tools.get("subagent").execute("call", { task }, undefined, undefined, h.ctx);
	}
	h.runs[0].resolve(completed("FIRST"));
	h.runs[1].resolve(completed("SECOND"));
	await flush();
	h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
	assert.equal(h.sent.length, 2);
	assert.deepEqual(h.sent.map(item => item.options.triggerTurn), [false, true]);
	h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
	assert.equal(h.sent.length, 2);
});

test("session replacement discards buffered results", async t => {
	const h = toolHarness(t);
	h.ctx.isIdle = () => false;
	await h.tools.get("subagent").execute("call", { task: "old session" }, undefined, undefined, h.ctx);
	h.runs[0].resolve(completed("OLD_SESSION"));
	await flush();
	h.handlers.get("session_before_switch")();
	h.handlers.get("session_start")({}, h.ctx);
	assert.equal(h.handlers.get("agent_before_settle")({ outcome: "completed" }, h.ctx), undefined);
	h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
	assert.equal(h.sent.length, 0);
});

test("real session consumes user follow-ups separately, then all subagent results together", { timeout: 10000 }, async t => {
	const {
		createAgentSession, createEventBus, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager,
	} = await import(pathToFileURL(`${root}/dist/index.js`));
	const { loadExtensionFromFactory } = await import(pathToFileURL(`${root}/dist/core/extensions/loader.js`));
	const { AssistantMessageEventStream } = await import(pathToFileURL(`${root}/node_modules/@earendil-works/pi-ai/dist/index.js`));
	const dir = mkdtempSync(join(tmpdir(), "pi-subagent-batch-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	t.mock.method(globalThis, "fetch", () => { throw new Error("Network access is forbidden in this test"); });
	const modelRuntime = await ModelRuntime.create({
		authPath: join(dir, "auth.json"), modelsPath: null, modelsStorePath: join(dir, "catalog.json"),
		refreshOnCreate: false, allowModelNetwork: false,
	});
	const model = modelRuntime.getModels("openai")[0];
	assert.ok(model);
	t.mock.method(modelRuntime, "hasConfiguredAuth", () => true);
	const runs = [];
	const runtime = createExtensionRuntime();
	const loaded = await loadExtensionFromFactory(pi => extension(pi,
		options => new Promise(resolve => runs.push({ options, resolve })),
		{ display: { statusBar: "hidden" } },
	), dir, createEventBus(), runtime);
	const resourceLoader = {
		getExtensions: () => ({ extensions: [loaded], errors: [], runtime }),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => "Test assistant",
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
		extendResources() {}, reload: async () => {},
	};
	const settingsManager = SettingsManager.inMemory({
		followUpMode: "one-at-a-time", compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
	});
	const { session } = await createAgentSession({
		cwd: dir, agentDir: dir, model, modelRuntime, resourceLoader, settingsManager,
		sessionManager: SessionManager.inMemory(dir), tools: [], thinkingLevel: "off",
	});
	t.after(() => session.dispose());
	const errors = [];
	await session.bindExtensions({ mode: "print", onError: error => errors.push(error) });
	const requests = [];
	let finishInitial;
	let started;
	const initialStarted = new Promise(resolve => { started = resolve; });
	t.mock.method(modelRuntime, "streamSimple", (_model, context) => {
		requests.push(structuredClone(context.messages));
		const stream = new AssistantMessageEventStream();
		const finish = () => {
			const message = {
				role: "assistant", api: model.api, provider: model.provider, model: model.id,
				content: [{ type: "text", text: "ACK" }], stopReason: "stop", timestamp: Date.now(),
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			};
			stream.push({ type: "done", reason: "stop", message });
			stream.end(message);
		};
		if (requests.length === 1) {
			finishInitial = finish;
			started();
		} else finish();
		return stream;
	});
	const mainRun = session.prompt("MAIN_TASK");
	await initialStarted;
	await session.prompt("/subagent inspect A");
	await session.prompt("/subagent inspect B");
	assert.equal(runs.length, 2);
	await session.followUp("USER_ONE");
	await session.followUp("USER_TWO");
	runs[0].resolve(completed("RESULT_A"));
	runs[1].resolve(completed("RESULT_B"));
	await flush();
	finishInitial();
	await mainRun;
	assert.deepEqual(errors, []);
	assert.equal(requests.length, 4);
	const text = messages => messages.map(message => typeof message.content === "string"
		? message.content : message.content.filter(part => part.type === "text").map(part => part.text).join("\n")).join("\n");
	assert.match(text(requests[1]), /USER_ONE/);
	assert.doesNotMatch(text(requests[1]), /USER_TWO|RESULT_A|RESULT_B/);
	assert.match(text(requests[2]), /USER_TWO/);
	assert.doesNotMatch(text(requests[2]), /RESULT_A|RESULT_B/);
	assert.match(text(requests[3]), /RESULT_A/);
	assert.match(text(requests[3]), /RESULT_B/);
	assert.equal(session.agent.followUpMode, "one-at-a-time");
	assert.equal(settingsManager.getFollowUpMode(), "one-at-a-time");
	const resultEntries = session.sessionManager.getBranch().filter(entry =>
		entry.type === "custom_message" && entry.customType === "subagent-result");
	assert.deepEqual(resultEntries.map(entry => entry.details.jobId), [1, 2]);
});

for (const injectedToolCalls of ["compact", "none"]) {
	test(`read results inject without Pi's formatReadLineRange export: ${injectedToolCalls}`, async t => {
		const compatJiti = createJiti(import.meta.url, {
			moduleCache: false,
			fsCache: false,
			virtualModules: {
				"@earendil-works/pi-coding-agent": { getMarkdownTheme },
			},
			alias: {
				"@earendil-works/pi-ai": `${root}/node_modules/@earendil-works/pi-ai/dist/index.js`,
				"@earendil-works/pi-tui": `${root}/node_modules/@earendil-works/pi-tui/dist/index.js`,
			},
		});
		const compat = await compatJiti.import("../.pi/agent/extensions/subagent.ts");
		const h = toolHarness(t, { injectedToolCalls, maxConcurrent: 1 }, compat.default);
		for (const task of ["read a file", "next queued task"]) {
			await h.tools.get("subagent").execute("call", { task }, undefined, undefined, h.ctx);
		}
		const result = completed("READ_RESULT_SENTINEL");
		result.messages.unshift({ role: "assistant", content: [{
			type: "toolCall", name: "read", arguments: { path: "src/a.ts", offset: 10, limit: 20 },
		}] });
		h.runs[0].resolve(result);
		await flush();
		assert.equal(h.sent.length, 1);
		assert.equal(h.sent[0].message.details.failed, false);
		assert.match(h.sent[0].message.content, /READ_RESULT_SENTINEL/);
		assert.equal(h.sent[0].message.content.includes("read src/a.ts:10-29"), injectedToolCalls === "compact");
		assert.deepEqual(h.sent[0].message.details.toolCalls, ["read src/a.ts:10-29"]);
		assert.equal(h.runs.length, 2);
		h.runs[1].resolve(completed("NEXT_RESULT_SENTINEL"));
		await flush();
		assert.equal(h.sent.length, 2);
		assert.match(h.sent[1].message.content, /NEXT_RESULT_SENTINEL/);
	});
}

test("ampersand input is consumed without starting a duplicate main-agent request", async t => {
	const h = toolHarness(t);
	const result = h.handlers.get("input")({ text: "北京今天天气怎么样 &", source: "interactive" }, h.ctx);
	assert.deepEqual(result, { action: "handled" });
	assert.equal(h.runs.length, 1);
	assert.equal(h.runs[0].options.task, "北京今天天气怎么样");
	assert.equal(h.sent.length, 0);
	h.runs[0].resolve(completed("Weather result"));
	await flush();
	assert.equal(h.sent.length, 1);
	assert.match(h.sent[0].message.content, /Weather result/);
	assert.deepEqual(h.sent[0].options, { triggerTurn: true, deliverAs: "followUp" });
});

test("queued ampersand input is consumed even while the main agent is busy", async t => {
	const h = toolHarness(t, { maxConcurrent: 1 });
	await h.commands.get("subagent").handler("occupy worker slot", h.ctx);
	for (const streamingBehavior of ["steer", "followUp"]) {
		const result = h.handlers.get("input")({
			text: `${streamingBehavior} task &`, source: "interactive", streamingBehavior,
		}, h.ctx);
		assert.deepEqual(result, { action: "handled" });
	}
	assert.equal(h.runs.length, 1);
	assert.equal(h.sent.length, 0);
	h.runs[0].resolve(completed());
	await flush();
	assert.equal(h.runs[1].options.task, "steer task");
	h.runs[1].resolve(completed());
	await flush();
	assert.equal(h.runs[2].options.task, "followUp task");
});

test("ordinary and extension-injected inputs still pass through without spawning", t => {
	const h = toolHarness(t);
	for (const event of [
		{ text: "normal prompt", source: "interactive" },
		{ text: "result &", source: "extension" },
		{ text: "```bash\necho test &", source: "interactive" },
	]) {
		assert.deepEqual(h.handlers.get("input")(event, h.ctx), { action: "continue" });
	}
	assert.deepEqual(h.handlers.get("input")({ text: " & ", source: "interactive" }, h.ctx), { action: "handled" });
	assert.equal(h.runs.length, 0);
});

test("model tool returns a job ID before worker completion, then injects the matching result", { timeout: 2000 }, async t => {
	const h = toolHarness(t);
	const tool = h.tools.get("subagent");
	assert.ok(tool);
	assert.equal(tool.exposure, "direct");
	assert.match(tool.promptGuidelines.join(" "), /independent/);
	const result = await tool.execute("call", { task: "  inspect src  " }, undefined, undefined, h.ctx);
	assert.deepEqual(result.details, { jobId: 1, kind: "worker", status: "running" });
	assert.match(result.content[0].text, /automatically/);
	assert.equal(h.runs.length, 1);
	assert.equal(h.sent.length, 0);
	assert.equal(h.runs[0].options.task, "inspect src");
	assert.equal(h.runs[0].options.model, "test-provider/test-model");
	assert.equal(h.runs[0].options.thinkingLevel, "low");
	h.runs[0].resolve(completed("Inspected src"));
	await flush();
	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0].message.details.jobId, result.details.jobId);
	assert.match(h.sent[0].message.content, /worker #1.*done/);
	assert.match(h.sent[0].message.content, /Inspected src/);
	assert.deepEqual(h.sent[0].options, { triggerTurn: true, deliverAs: "followUp" });
});

test("model, command and ampersand dispatch share the concurrency cap and FIFO queue", async t => {
	const h = toolHarness(t);
	const tool = h.tools.get("subagent");
	await h.commands.get("subagent").handler("command task", h.ctx);
	h.handlers.get("input")({ text: "input task &", source: "interactive" }, h.ctx);
	for (let i = 0; i < 6; i++) {
		await tool.execute("call", { task: `tool task ${i}` }, undefined, undefined, h.ctx);
	}
	assert.equal(h.runs.length, 8);
	const ninth = await tool.execute("call", { task: "ninth" }, undefined, undefined, h.ctx);
	const tenth = await tool.execute("call", { task: "tenth", kind: "worker" }, undefined, undefined, h.ctx);
	assert.deepEqual(ninth.details, { jobId: 9, kind: "worker", status: "queued" });
	assert.equal(tenth.details.status, "queued");
	assert.equal(h.runs.length, 8);
	h.runs[0].resolve(completed());
	await flush();
	assert.equal(h.runs.length, 9);
	assert.equal(h.runs[8].options.task, "ninth");
	h.runs[1].resolve(completed());
	await flush();
	assert.equal(h.runs.length, 10);
	assert.equal(h.runs[9].options.task, "tenth");
});

test("model tool rejects empty tasks, unknown kinds and cancelled dispatch without spawning", async t => {
	const h = toolHarness(t);
	const tool = h.tools.get("subagent");
	await assert.rejects(tool.execute("call", { task: " \n " }, undefined, undefined, h.ctx), /empty/);
	for (const kind of ["scout", "toString", "__proto__"]) {
		await assert.rejects(tool.execute("call", { task: "inspect", kind }, undefined, undefined, h.ctx), /Unknown subagent kind/);
	}
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(tool.execute("call", { task: "inspect" }, controller.signal, undefined, h.ctx), /cancelled/);
	assert.equal(h.runs.length, 0);
});

test("child processes register no dispatch tool, command or input hook", () => {
	const previous = process.env.PI_SUBAGENT_CHILD;
	const registrations = [];
	try {
		process.env.PI_SUBAGENT_CHILD = "1";
		extension({
			on: (...args) => registrations.push(args),
			registerTool: (...args) => registrations.push(args),
			registerCommand: (...args) => registrations.push(args),
			registerMessageRenderer: (...args) => registrations.push(args),
		}, () => { throw new Error("A child must not dispatch"); });
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
		else process.env.PI_SUBAGENT_CHILD = previous;
	}
	assert.deepEqual(registrations, []);
});

test("background jobs outlive the dispatch signal but are cancelled with the session", async t => {
	const h = toolHarness(t);
	const tool = h.tools.get("subagent");
	const controller = new AbortController();
	await tool.execute("call", { task: "inspect" }, controller.signal, undefined, h.ctx);
	controller.abort();
	assert.equal(h.runs[0].options.signal.aborted, false);
	h.handlers.get("session_before_switch")();
	assert.equal(h.runs[0].options.signal.aborted, true);
	h.runs[0].resolve(completed());
	await flush();
	assert.equal(h.sent.length, 0);
	await assert.rejects(tool.execute("call", { task: "inspect" }, undefined, undefined, h.ctx), /current session/);
});

test("failed worker results are correlated with the dispatched job", async t => {
	const h = toolHarness(t);
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].resolve({ ...completed(), exitCode: 1, stopReason: "error", errorMessage: "worker failed" });
	await flush();
	assert.equal(h.sent[0].message.details.jobId, 1);
	assert.equal(h.sent[0].message.details.status, "failed");
	assert.match(h.sent[0].message.content, /worker #1.*failed/);
});

test("worker launch errors produce a failure follow-up instead of silently disappearing", async t => {
	const h = toolHarness(t);
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].reject(new Error("launch failed"));
	await flush();
	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0].message.details.status, "failed");
	assert.match(h.sent[0].message.content, /launch failed/);
});

test("Pi's extension loader registers the model tool and its TypeBox schema", async () => {
	const { loadExtensions } = await import(pathToFileURL(`${root}/dist/core/extensions/loader.js`));
	const extensionPath = fileURLToPath(new URL("../.pi/agent/extensions/subagent.ts", import.meta.url));
	const result = await loadExtensions([extensionPath], "/tmp");
	assert.deepEqual(result.errors, []);
	assert.ok(result.extensions[0].messageRenderers.has("subagent-result"));
	const tool = result.extensions[0].tools.get("subagent").definition;
	assert.equal(tool.exposure, "direct");
	assert.equal(tool.parameters.properties.task.type, "string");
	assert.deepEqual(tool.parameters.required, ["task"]);
});

for (const mode of ["always", "expanded", "never"]) {
	test(`result renderer keeps failures visible in ${mode} mode`, async t => {
		const h = toolHarness(t, { display: { finalResponse: mode } });
		await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
		h.runs[0].resolve({ ...completed(), exitCode: 1, stopReason: "error", errorMessage: "FAILURE_REASON_SENTINEL" });
		await flush();
		initTheme("dark", false);
		const message = h.sent[0].message;
		assert.equal(message.details.failed, true);
		assert.equal(message.details.reason, "FAILURE_REASON_SENTINEL");
		assert.equal(message.details.finalText, "");
		const component = new CustomMessageComponent(message, h.renderers.get("subagent-result"));
		for (const expanded of [false, true]) {
			component.setExpanded(expanded);
			const text = component.render(80).map(stripTerminalSequences).join("\n");
			assert.match(text, /FAILURE_REASON_SENTINEL/);
			assert.doesNotMatch(text, /Done/);
			assert.equal(text.includes("Details collapsed"), !expanded);
			assert.match(text, /inspect/);
		}
	});
}

test("legacy results without headerText fall back even when summaryText exists", t => {
	const h = toolHarness(t);
	initTheme("dark", false);
	const message = { customType: "subagent-result", content: "OLD_RESULT_SENTINEL", details: { jobId: 1, summaryText: "OLD_SUMMARY_SENTINEL" }, display: true };
	const renderer = h.renderers.get("subagent-result");
	assert.equal(renderer(message, { expanded: false, outputPad: 1 }, theme), undefined);
	const component = new CustomMessageComponent(message, renderer);
	const fallback = component.render(80).map(stripTerminalSequences).join("\n");
	assert.match(fallback, /OLD_RESULT_SENTINEL/);
	assert.doesNotMatch(fallback, /OLD_SUMMARY_SENTINEL/);
});

test("result details retain full task, capped summaries, truncation, and tool counts", async t => {
	const task = "task ".repeat(40) + "TASK_TAIL_SENTINEL";
	const h = toolHarness(t, { display: { toolCalls: "always", finalResponse: "always" } });
	await h.tools.get("subagent").execute("call", { task }, undefined, undefined, h.ctx);
	const result = completed("F".repeat(3500) + "DISCARDED_FINAL_SENTINEL" + "F".repeat(3500));
	result.messages.unshift(...Array.from({ length: 12 }, (_, i) => ({ role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: `command-${i}` } }] })));
	h.runs[0].resolve(result);
	await flush();
	const message = h.sent[0].message;
	assert.equal(message.details.task, task.trim());
	assert.match(message.details.headerText, /worker #1.*done/);
	assert.equal(message.details.toolCallCount, 12);
	assert.equal(message.details.toolCalls.length, 10);
	assert.match(message.details.finalText, /truncated/i);
	assert.ok(message.details.finalText.length <= 6000);
	assert.doesNotMatch(message.details.finalText, /DISCARDED_FINAL_SENTINEL/);
	assert.deepEqual(message.details.toolCalls, Array.from({ length: 10 }, (_, i) => `$ command-${i + 2}`));
	assert.match(message.content, /showing last 10 of 12 tool calls/);
	initTheme("dark", false);
	const component = new CustomMessageComponent(message, h.renderers.get("subagent-result"));
	const collapsed = component.render(80).map(stripTerminalSequences);
	assert.doesNotMatch(collapsed.join("\n"), /TASK_TAIL_SENTINEL/);
	assert.equal(collapsed.filter(line => line.trim().startsWith("Task:")).length, 1);
	assert.ok(collapsed.every(line => !line.includes("task") || line.trim().startsWith("Task:")));
	component.setExpanded(true);
	const rendered = component.render(120).map(stripTerminalSequences).join("\n");
	assert.match(rendered, /truncated/i);
	assert.match(rendered, /showing last 10 of 12 tool calls/);
	assert.match(rendered, /TASK_TAIL_SENTINEL/);
	assert.doesNotMatch(rendered, /DISCARDED_FINAL_SENTINEL/);
});

test("default expansion hides result sections without retaining raw tool output or thinking", async t => {
	const h = toolHarness(t);
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	const result = completed("DEFAULT_FINAL_SENTINEL");
	result.messages.unshift(
		{ role: "assistant", content: [
			{ type: "thinking", thinking: "PRIVATE_THINKING_SENTINEL" },
			{ type: "toolCall", name: "bash", arguments: { command: "ls src" } },
		] },
		{ role: "toolResult", content: [{ type: "text", text: "RAW_OUTPUT_SENTINEL" }] },
	);
	h.runs[0].resolve(result);
	await flush();
	initTheme("dark", false);
	const message = h.sent[0].message;
	assert.doesNotMatch(JSON.stringify(message), /PRIVATE_THINKING_SENTINEL|RAW_OUTPUT_SENTINEL/);
	const component = new CustomMessageComponent(message, h.renderers.get("subagent-result"));
	for (const expanded of [false, true, false]) {
		component.setExpanded(expanded);
		const text = component.render(80).map(stripTerminalSequences).join("\n");
		assert.equal(text.includes("DEFAULT_FINAL_SENTINEL"), expanded);
		assert.equal(text.includes("$ ls src"), expanded);
	}
	assert.match(message.content, /DEFAULT_FINAL_SENTINEL/);
	assert.match(message.content, /\$ ls src/);
});

test("expansion reveals retained failure details and tool summaries without restoring truncated text", async t => {
	const h = toolHarness(t);
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	const result = completed("FAILED_FINAL_SENTINEL");
	result.exitCode = 1;
	result.stopReason = "error";
	result.errorMessage = "ERROR_HEAD\n" + "x".repeat(3500) + "DISCARDED_ERROR_SENTINEL" + "x".repeat(3500) + "\nERROR_TAIL_SENTINEL";
	result.messages.unshift({ role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "failed-command" } }] });
	h.runs[0].resolve(result);
	await flush();
	initTheme("dark", false);
	const message = h.sent[0].message;
	assert.ok(message.details.reason.length <= 6000);
	assert.match(message.details.reason, /truncated/);
	assert.doesNotMatch(message.details.reason, /DISCARDED_ERROR_SENTINEL/);
	const snapshot = JSON.stringify(message);
	const component = new CustomMessageComponent(message, h.renderers.get("subagent-result"));
	for (const expanded of [false, true, false]) {
		component.setExpanded(expanded);
		const lines = component.render(80);
		const text = lines.map(stripTerminalSequences).join("\n");
		assert.match(text, /ERROR_HEAD/);
		assert.equal(text.includes("ERROR_TAIL_SENTINEL"), expanded);
		assert.equal(text.includes("truncated"), expanded);
		assert.equal(text.includes("failed-command"), expanded);
		assert.doesNotMatch(text, /DISCARDED_ERROR_SENTINEL|FAILED_FINAL_SENTINEL/);
		assert.ok(lines.every(line => visibleWidth(line) <= 80));
	}
	assert.equal(JSON.stringify(message), snapshot);
});

test("empty final responses stay folded by default and show a placeholder when expanded", async t => {
	const h = toolHarness(t, { display: { toolCalls: "never" } });
	await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
	h.runs[0].resolve(completed(""));
	await flush();
	initTheme("dark", false);
	const message = h.sent[0].message;
	assert.match(message.content, /\(no output\)/);
	const component = new CustomMessageComponent(message, h.renderers.get("subagent-result"));
	assert.doesNotMatch(component.render(80).map(stripTerminalSequences).join("\n"), /\(no output\)/);
	component.setExpanded(true);
	assert.match(component.render(80).map(stripTerminalSequences).join("\n"), /\(no output\)/);
});

for (const finalPolicy of ["always", "expanded", "never"]) {
	for (const toolPolicy of ["always", "expanded", "never"]) {
		for (const injectedToolCalls of ["compact", "none"]) {
			test(`nested display policy ${finalPolicy}/${toolPolicy}, injected ${injectedToolCalls}`, async t => {
				const h = toolHarness(t, { injectedToolCalls, display: { finalResponse: finalPolicy, toolCalls: toolPolicy } });
				await h.tools.get("subagent").execute("call", { task: "inspect" }, undefined, undefined, h.ctx);
				const result = completed("**WORKER_FINAL_SENTINEL**\n\n探索结果：代码已检查。");
				result.messages.unshift({ role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "ls src" } }] });
				h.runs[0].resolve(result);
				await flush();
				const message = h.sent[0].message;
				assert.match(message.content, /WORKER_FINAL_SENTINEL/);
				assert.doesNotMatch(message.content, /Ctrl\+[oO]/);
				assert.equal(message.display, true);
				assert.equal(typeof message.details.headerText, "string");
				assert.equal(message.details.task, "inspect");
				assert.deepEqual(message.details.toolCalls, ["$ ls src"]);
				assert.equal(message.details.toolCallCount, 1);
				assert.equal("summaryText" in message.details, false);
				const snapshot = JSON.stringify(message);
				const renderer = h.renderers.get("subagent-result");
				for (const name of ["dark", "light"]) {
					initTheme(name, false);
					const component = new CustomMessageComponent(message, renderer);
					for (const expanded of [false, true, false]) {
						component.setExpanded(expanded);
						for (const width of [24, 80, 120]) {
							// Check directly: CustomMessageComponent falls back silently on renderer errors.
							assert.ok(renderer(message, { expanded, outputPad: 1 }, theme));
							component.invalidate();
							const lines = component.render(width);
							const text = lines.map(stripTerminalSequences).join("\n");
							assert.equal(text.includes("WORKER_FINAL_SENTINEL"), finalPolicy === "always" || (finalPolicy === "expanded" && expanded));
							assert.equal(text.includes("$ ls src"), toolPolicy === "always" || (toolPolicy === "expanded" && expanded));
							assert.doesNotMatch(text, /Ctrl\+O/);
							if (width >= 80) assert.equal(text.includes("Details collapsed (Ctrl+o to expand)"), !expanded);
							assert.match(text, /worker #1/);
							assert.match(text, /Task: inspect/);
							assert.ok(lines.every(line => visibleWidth(line) <= width));
						}
					}
				}
				assert.equal(JSON.stringify(message), snapshot);
				assert.equal(h.sent[0].message.content.includes("$ ls src"), injectedToolCalls === "compact");
			});
		}
	}
}

test("system prompt asks the model to call subagent instead of asking the user to dispatch", () => {
	const prompt = readFileSync(new URL("../.pi/agent/APPEND_SYSTEM.md", import.meta.url), "utf8");
	assert.match(prompt, /prefer calling the `subagent` tool/);
	assert.doesNotMatch(prompt, /Explicitly propose the split/);
});
