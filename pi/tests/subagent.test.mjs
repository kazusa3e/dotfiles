import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = process.env.PI_PACKAGE_ROOT;
if (!root) throw new Error("Set PI_PACKAGE_ROOT to the installed pi package directory");
const { createJiti } = await import(pathToFileURL(`${root}/node_modules/jiti/lib/jiti.mjs`));
const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${root}/dist/index.js`,
		"@earendil-works/pi-ai": `${root}/node_modules/@earendil-works/pi-ai/dist/index.js`,
	},
});
const { Container } = await import(pathToFileURL(`${root}/node_modules/@earendil-works/pi-tui/dist/index.js`));
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
	spinner: "▘",
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

test("normalizeSubagentConfig applies defaults", () => {
	assert.deepEqual(normalizeSubagentConfig({}), { ...DEFAULT_SUBAGENT_CONFIG });
	assert.equal(normalizeSubagentConfig(undefined).maxConcurrent, 8);
	assert.equal(normalizeSubagentConfig(null).thinking, null);
});

test("normalizeSubagentConfig clamps and validates values", () => {
	const config = normalizeSubagentConfig({
		maxConcurrent: 999,
		model: "  provider/model  ",
		thinking: "quantum",
		statusBar: "weird",
		injectedToolCalls: "everything",
	});
	assert.equal(config.maxConcurrent, 64);
	assert.equal(config.model, "provider/model");
	assert.equal(config.thinking, "high");
	assert.equal(config.statusBar, "lines");
	assert.equal(config.injectedToolCalls, "compact");

	const clamped = normalizeSubagentConfig({ maxConcurrent: 0 });
	assert.equal(clamped.maxConcurrent, 1);

	const configured = normalizeSubagentConfig({ statusBar: "oneline", maxConcurrent: 3 });
	assert.equal(configured.statusBar, "oneline");
	assert.equal(configured.maxConcurrent, 3);
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
});

test("buildStatusLines renders one line per job with aligned columns", () => {
	const lines = buildStatusLines([view({}), view({ topic: "write tests", status: "queued", spinner: "·" })], {
		width: 80,
		mode: "lines",
	});
	assert.equal(lines.length, 2);
	assert.ok(lines[0].startsWith("#1 "));
	assert.ok(lines[0].includes("explore the codebase"));
	assert.ok(lines[0].includes("↑3.2k ↓400"));
	assert.ok(lines[0].includes("12s"));
	assert.ok(lines[1].includes("write tests"));
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
		sendMessage: (...args) => sent.push(args),
	};
	const ctx = {
		mode: "tui", hasUI: true, cwd: "/tmp", thinkingLevel: "low",
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
	extension(pi, run);
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
	assert.match(rows[0], /[▘▝▖▗]/);
	t.mock.timers.tick(1000);
	widget.invalidate();
	const nextRows = container.render(80);
	assert.notEqual(nextRows[0], rows[0]);
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

function toolHarness(t) {
	const handlers = new Map();
	const commands = new Map();
	const tools = new Map();
	const runs = [];
	const sent = [];
	const ctx = {
		mode: "json", hasUI: false, cwd: "/tmp",
		model: { provider: "test-provider", id: "test-model" }, thinkingLevel: "low",
		ui: { notify() {} },
	};
	const pi = {
		on: (name, handler) => handlers.set(name, handler),
		registerCommand: (name, command) => commands.set(name, command),
		registerTool: tool => tools.set(tool.name, tool),
		sendMessage: (message, options) => sent.push({ message, options }),
	};
	extension(pi, options => new Promise((resolve, reject) => runs.push({ options, resolve, reject })));
	handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	return { handlers, commands, tools, runs, sent, ctx };
}

const completed = (text = "Done") => ({
	exitCode: 0, aborted: false, stderr: "", turns: 1,
	usage: { input: 100, output: 20, cost: 0 }, stopReason: "stop",
	messages: [{ role: "assistant", content: [{ type: "text", text }] }],
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test("model tool returns a job ID before worker completion, then injects the matching result", { timeout: 2000 }, async t => {
	const h = toolHarness(t);
	const tool = h.tools.get("subagent");
	assert.ok(tool);
	assert.equal(tool.exposure, "model-only");
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
	const tool = result.extensions[0].tools.get("subagent").definition;
	assert.equal(tool.exposure, "model-only");
	assert.equal(tool.parameters.properties.task.type, "string");
	assert.deepEqual(tool.parameters.required, ["task"]);
});

test("system prompt asks the model to call subagent instead of asking the user to dispatch", () => {
	const prompt = readFileSync(new URL("../.pi/agent/APPEND_SYSTEM.md", import.meta.url), "utf8");
	assert.match(prompt, /prefer calling the `subagent` tool/);
	assert.doesNotMatch(prompt, /Explicitly propose the split/);
});
