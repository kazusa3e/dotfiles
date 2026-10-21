/**
 * Background Subagent Extension
 *
 * Spawns subagents as non-blocking background processes with isolated context,
 * trimmed from the official examples/extensions/subagent tool and re-shaped to
 * a fire-and-forget model:
 *
 *   - The subagent tool, a user prompt ending with `&`, or /subagent spawns a
 *     worker in the background without blocking the main session.
 *   - While running, each queued/running subagent has one line in a status bar
 *     rendered below the input box; the line disappears when it finishes.
 *   - On completion the result is injected back into the main agent as a custom
 *     message (simplified one-line tool-call view + final output + usage) and
 *     triggers a new turn (queued as followUp when the agent is busy).
 *   - Only the "worker" kind exists; the kind registry leaves room for more.
 *   - No depth limit / no nested spawn: child processes get PI_SUBAGENT_CHILD=1
 *     and never react to `&` or /subagent.
 *
 * Config: {PI_CODING_AGENT_DIR|~/.pi/agent}/pi-subagent.json
 *   - maxConcurrent (default 8): running cap; extra jobs queue FIFO.
 *   - model / thinking (default null): override the inherited main-agent model
 *     and thinking level for workers.
 *   - injectedToolCalls: "compact" (default) | "none" (model context only)
 *   - display.statusBar: "lines" (default) | "oneline" | "hidden"
 *   - display.toolCalls / display.finalResponse: "always" | "expanded" (default)
 *     | "never". Ctrl+o toggles result details without changing model context.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { Type, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { formatReadLineRange, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Box, Markdown, Text, TruncatedText } from "@earendil-works/pi-tui";

// ── config ─────────────────────────────────────────────────────────────────

export type ResultVisibility = "always" | "expanded" | "never";

export interface SubagentConfig {
	/** Max simultaneously running subagents; the rest queue FIFO. */
	maxConcurrent: number;
	/** Override model ("provider/id") for workers; null inherits the main agent. */
	model: string | null;
	/** Override thinking level for workers; null inherits the main agent. */
	thinking: string | null;
	/** Tool-call lines in the model-facing result; independent of display settings. */
	injectedToolCalls: "compact" | "none";
	display: {
		statusBar: "lines" | "oneline" | "hidden";
		toolCalls: ResultVisibility;
		finalResponse: ResultVisibility;
	};
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
	maxConcurrent: 8,
	model: null,
	thinking: null,
	injectedToolCalls: "compact",
	display: {
		statusBar: "lines",
		toolCalls: "expanded",
		finalResponse: "expanded",
	},
};

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const STATUS_BAR_MODES = ["lines", "oneline", "hidden"] as const;
const INJECTED_TOOL_MODE = ["compact", "none"] as const;
const RESULT_VISIBILITY_MODES = ["always", "expanded", "never"] as const;

function pickInt(value: unknown, fallback: number, min: number, max: number): number {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(n)));
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

export function normalizeSubagentConfig(input: unknown): SubagentConfig {
	const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const display = (source.display && typeof source.display === "object" ? source.display : {}) as Record<string, unknown>;
	// Keep existing personal configs working while display settings move into one group.
	const legacyFinal = source.finalResponse === "show"
		? "always"
		: source.finalResponse === "hidden" ? "never" : source.finalResponse;
	return {
		maxConcurrent: pickInt(source.maxConcurrent, DEFAULT_SUBAGENT_CONFIG.maxConcurrent, 1, 64),
		model: typeof source.model === "string" && source.model.trim() ? source.model.trim() : null,
		thinking:
			typeof source.thinking === "string"
				? (pickEnum(source.thinking, THINKING_LEVELS, "high") as string)
				: null,
		injectedToolCalls: pickEnum(
			source.injectedToolCalls,
			INJECTED_TOOL_MODE,
			DEFAULT_SUBAGENT_CONFIG.injectedToolCalls,
		),
		display: {
			statusBar: pickEnum(
				display.statusBar === undefined ? source.statusBar : display.statusBar,
				STATUS_BAR_MODES,
				DEFAULT_SUBAGENT_CONFIG.display.statusBar,
			),
			toolCalls: pickEnum(display.toolCalls, RESULT_VISIBILITY_MODES, DEFAULT_SUBAGENT_CONFIG.display.toolCalls),
			finalResponse: pickEnum(
				display.finalResponse === undefined ? legacyFinal : display.finalResponse,
				RESULT_VISIBILITY_MODES,
				DEFAULT_SUBAGENT_CONFIG.display.finalResponse,
			),
		},
	};
}

export const SUBAGENT_CONFIG_PATH = path.join(
	process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent"),
	"pi-subagent.json",
);

export function loadSubagentConfig(): SubagentConfig {
	try {
		if (existsSync(SUBAGENT_CONFIG_PATH)) {
			return normalizeSubagentConfig(JSON.parse(readFileSync(SUBAGENT_CONFIG_PATH, "utf8")));
		}
	} catch {
		// Ignore bad config and fall back to defaults.
	}
	return normalizeSubagentConfig(undefined);
}

// ── `&` trigger parsing ─────────────────────────────────────────────────────

const FENCE_RE = /^[ \t]*```/;

/**
 * Detect a trailing `&` that requests a background subagent.
 *
 * The `&` must be the last non-whitespace character and must not sit inside an
 * unclosed fenced code block (a pasted blob may legitimately end with `&`).
 * `"foo &&&"` strips exactly one `&`, leaving `"foo &&"`.
 */
export function splitTrailingAmpersand(text: string): { task: string; triggered: boolean } {
	const trimmed = text.trimEnd();
	if (!trimmed.endsWith("&")) return { task: text, triggered: false };
	const lines = trimmed.split("\n");
	let fenceCount = 0;
	for (let i = 0; i < lines.length - 1; i++) {
		if (FENCE_RE.test(lines[i])) fenceCount++;
	}
	// Odd fence count means the trailing line is inside a code block.
	if (fenceCount % 2 === 1) return { task: text, triggered: false };
	return { task: trimmed.slice(0, -1).trimEnd(), triggered: true };
}

// ── kinds ────────────────────────────────────────────────────────────────────

export interface SubagentKind {
	name: string;
	/** Appended to the worker's system prompt. */
	systemPrompt: string;
}

export const WORKER_SYSTEM_PROMPT = `You are a general-purpose worker subagent running in a separate pi process with an isolated context.
Complete the delegated task using the available tools.
Read before writing, verify results, and keep the work self-contained.
Do not spawn other agents and do not ask for confirmation.
End with a concise summary of what was done and the key results.`;

/** Kind registry: the only built-in kind is "worker"; add entries here for more. */
export const SUBAGENT_KINDS: Record<string, SubagentKind> = {
	worker: { name: "worker", systemPrompt: WORKER_SYSTEM_PROMPT },
};

/**
 * Parse an optional "kind:task" prefix (command syntax) for future kinds.
 * Unknown prefixes are treated as part of the task.
 */
export function parseKindPrefix(text: string): { kind: string; task: string } {
	const match = text.match(/^([A-Za-z][\w-]*):([\s\S]*)$/);
	if (match && SUBAGENT_KINDS[match[1]]) return { kind: match[1], task: match[2].trim() };
	return { kind: "worker", task: text.trim() };
}

// ── formatting helpers ──────────────────────────────────────────────────────

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function formatElapsed(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m${seconds % 60}s`;
}

const WIDE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\uFF00-\uFFEF]/u;

function charWidth(ch: string): number {
	return WIDE_RE.test(ch) ? 2 : 1;
}

export function plainWidth(text: string): number {
	let width = 0;
	for (const ch of text) width += charWidth(ch);
	return width;
}

/** Truncate plain (unstyled) text to a column budget, appending "…" when cut. */
export function truncatePlain(text: string, budget: number): string {
	if (budget <= 0) return "";
	if (budget === 1) return "…";
	let out = "";
	let width = 0;
	let truncated = false;
	for (const ch of text) {
		const cw = charWidth(ch);
		// Reserve one column for the ellipsis so the result never overflows.
		if (width + cw > budget - 1) {
			truncated = true;
			break;
		}
		out += ch;
		width += cw;
	}
	return truncated ? out + "…" : out;
}

function collapseToolText(value: string, limit = 120): string {
	const text = value.replace(/\s+/g, " ").trim();
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function parseToolArgs(args: unknown): Record<string, unknown> {
	try {
		const parsed = typeof args === "string" ? JSON.parse(args) : args;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

/** One-line summaries for tool calls in the injected result. */
export function formatCompactToolCall(toolName: string, rawArgs: unknown): string {
	const args = parseToolArgs(rawArgs);
	const pathOf = (keys: string[]) => {
		for (const key of keys) {
			if (typeof args[key] === "string") return args[key] as string;
		}
		return undefined;
	};
	switch (toolName) {
		case "bash":
			return `$ ${collapseToolText(typeof args.command === "string" ? args.command : "...")}`;
		case "read": {
			const file = pathOf(["file_path", "path"]);
			if (!file) return "read …";
			const range = formatReadLineRange(args.offset, args.limit);
			return range ? `read ${file}${range}` : `read ${file}`;
		}
		case "write": {
			const file = pathOf(["file_path", "path"]) ?? "…";
			const content = typeof args.content === "string" ? args.content : "";
			const lines = content ? content.split("\n").length : 0;
			return lines > 1 ? `write ${file} (${lines} lines)` : `write ${file}`;
		}
		case "edit":
			return `edit ${pathOf(["file_path", "path"]) ?? "…"}`;
		case "grep": {
			const pattern = collapseToolText(typeof args.pattern === "string" ? args.pattern : "", 60);
			const file = pathOf(["path", "directory"]);
			return file ? `grep /${pattern}/ in ${file}` : `grep /${pattern}/`;
		}
		case "find": {
			const pattern = collapseToolText(typeof args.pattern === "string" ? args.pattern : "", 60);
			const file = pathOf(["path"]) ?? ".";
			return `find ${pattern} in ${file}`;
		}
		case "ls":
			return `ls ${pathOf(["path"]) ?? "."}`;
		default: {
			const json = JSON.stringify(args);
			const preview = json.length > 80 ? `${json.slice(0, 79)}…` : json;
			return `${toolName} ${preview}`;
		}
	}
}

function truncateMiddle(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const marker = "\n[…truncated…]";
	const head = Math.floor((limit - marker.length) / 2);
	return `${text.slice(0, head).replace(/[\uD800-\uDBFF]$/, "")}${marker}${text
		.slice(-(limit - marker.length - head))
		.replace(/^[\uDC00-\uDFFF]/, "")}`;
}

// ── injected result ─────────────────────────────────────────────────────────

export interface UsageStats {
	input: number;
	output: number;
	cost: number;
}

export interface InjectedSummary {
	jobId?: number;
	kind: string;
	failed: boolean;
	reason?: string;
	turns: number;
	usage: UsageStats;
	elapsedMs: number;
	finalText?: string;
	toolCalls: { name: string; args: unknown }[];
	toolCallCount?: number;
	toolCallMode: "compact" | "none";
}

interface ResultDetails {
	headerText: string;
	task: string;
	toolCalls: string[];
	toolCallCount: number;
	finalText: string;
	failed: boolean;
	reason?: string;
}

function buildResultHeader(summary: InjectedSummary): string {
	const stats: string[] = [];
	if (summary.turns > 0) stats.push(`${summary.turns} turn${summary.turns === 1 ? "" : "s"}`);
	const usage = summary.usage;
	if (usage.input || usage.output) stats.push(`↑${formatTokens(usage.input)} ↓${formatTokens(usage.output)}`);
	if (usage.cost > 0) stats.push(`$${usage.cost.toFixed(4)}`);
	stats.push(formatElapsed(summary.elapsedMs));
	const jobLabel = summary.jobId === undefined ? "" : ` #${summary.jobId}`;
	return `[subagent ${summary.kind}${jobLabel}] ${summary.failed ? "failed" : "done"} · ${stats.join(" · ")}`;
}

/** Text sent back into the main agent's session when a subagent finishes. */
export function buildInjectedContent(summary: InjectedSummary): string {
	const head = buildResultHeader(summary);
	if (summary.failed) {
		const reason = (summary.reason ?? "").replace(/\s+/g, " ").trim();
		return reason ? `${head}\n\n→ ${collapseToolText(reason, 400)}` : head;
	}
	const parts: string[] = [head];
	if (summary.toolCallMode === "compact" && summary.toolCalls.length > 0) {
		parts.push("", ...summary.toolCalls.map((call) => `→ ${formatCompactToolCall(call.name, call.args)}`));
		if ((summary.toolCallCount ?? 0) > summary.toolCalls.length) {
			parts.push(`[…showing last ${summary.toolCalls.length} of ${summary.toolCallCount} tool calls…]`);
		}
	}
	const finalText = (summary.finalText ?? "").trim();
	parts.push("", finalText ? truncateMiddle(finalText, 6000) : "(no output)");
	return parts.join("\n");
}

// ── status bar lines ────────────────────────────────────────────────────────

export type StatusRole = "index" | "spinner" | "kind" | "topic" | "tokens" | "time" | "queued";
export type StatusStyler = (role: StatusRole, text: string) => string;

export interface StatusJobView {
	kind: string;
	topic: string;
	status: "queued" | "running";
	elapsedMs: number;
	input: number;
	output: number;
	spinner: string;
}

export interface StatusLineOptions {
	width: number;
	mode: "lines" | "oneline";
	style?: StatusStyler;
}

/** Build the status bar lines below the editor; one line per active subagent. */
export function buildStatusLines(views: StatusJobView[], options: StatusLineOptions): string[] {
	if (views.length === 0 || options.width < 24) return [];
	const style = options.style ?? ((_role: StatusRole, text: string) => text);

	if (options.mode === "oneline") {
		const separator = " · ";
		const budget = Math.max(
			6,
			Math.floor((options.width - separator.length * (views.length - 1) - 1) / views.length),
		);
		const line = views
			.map((view) => {
				const role = view.status === "queued" ? "queued" : "spinner";
				return `${style(role, view.spinner)} ${style("topic", truncatePlain(view.topic, budget))}`;
			})
			.join(separator);
		return [line];
	}

	const lines: string[] = [];
	for (const [index, view] of views.entries()) {
		const plainLeft = `#${index + 1} ${view.spinner} ${view.kind}`;
		const rightParts: string[] = [];
		if (view.input || view.output) {
			rightParts.push(`↑${formatTokens(view.input)} ↓${formatTokens(view.output)}`);
		}
		rightParts.push(view.status === "queued" ? "queued" : formatElapsed(view.elapsedMs));
		const plainRight = rightParts.join(" · ");
		const topicBudget = Math.max(4, options.width - plainWidth(plainLeft) - plainWidth(plainRight) - 4);
		const topic = truncatePlain(view.topic, topicBudget);
		const padded = topic + " ".repeat(topicBudget - plainWidth(topic));

		const spinnerRole = view.status === "queued" ? "queued" : "spinner";
		const head = `${style("index", `#${index + 1}`)} ${style(spinnerRole, view.spinner)} ${style("kind", view.kind)}`;
		const right = rightParts.map((part, i) => {
			const role = i === 0 ? "tokens" : view.status === "queued" ? "queued" : "time";
			return style(role, part);
		});
		lines.push(`${head}  ${style("topic", padded)}  ${right.join(" · ")}`);
	}
	return lines;
}

// ── child process runner ────────────────────────────────────────────────────

const RUNNING_FRAMES = ["▘", "▝", "▖", "▗"];

export interface RunResult {
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	turns: number;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	aborted: boolean;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

async function runChild(options: {
	kind: string;
	task: string;
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	signal?: AbortSignal;
	onMessage?: (message: Message) => void;
}): Promise<RunResult> {
	const kind = SUBAGENT_KINDS[options.kind];
	const args = ["--mode", "json", "-p", "--no-session"];
	if (options.model) args.push("--model", options.model);
	if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
	if (kind) args.push("--append-system-prompt", kind.systemPrompt);
	args.push(`Task: ${options.task}`);

	const result: RunResult = {
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cost: 0 },
		turns: 0,
		aborted: false,
	};
	// Children never react to `&` or /subagent, so a nested spawn cannot happen.
	const invocation = getPiInvocation(args);
	const proc = spawn(invocation.command, invocation.args, {
		cwd: options.cwd,
		shell: false,
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, PI_SUBAGENT_CHILD: "1" },
	});
	let buffer = "";

	const processLine = (line: string) => {
		if (!line.trim()) return;
		let event: { type?: string; message?: Message };
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type === "message_end" && event.message) {
			const msg = event.message;
			result.messages.push(msg);
			if (msg.role === "assistant") {
				result.turns++;
				const usage = msg.usage;
				if (usage) {
					result.usage.input += usage.input || 0;
					result.usage.output += usage.output || 0;
					result.usage.cost += usage.cost?.total || 0;
				}
				if (!result.model && msg.model) result.model = msg.model;
				if (msg.stopReason) result.stopReason = msg.stopReason;
				if (msg.errorMessage) result.errorMessage = msg.errorMessage;
			}
			options.onMessage?.(msg);
		} else if (event.type === "tool_result_end" && event.message) {
			result.messages.push(event.message);
		}
	};

	proc.stdout.on("data", (data: Uint8Array | string) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";
		for (const line of lines) processLine(line);
	});
	proc.stderr.on("data", (data: Uint8Array | string) => {
		result.stderr += data.toString();
	});

	const exitPromise = new Promise<number>((resolve) => {
		proc.on("close", (code: number) => {
			if (buffer.trim()) processLine(buffer);
			resolve(code ?? 0);
		});
		proc.on("error", () => resolve(1));
	});

	const signal = options.signal;
	if (signal) {
		const killProc = () => {
			result.aborted = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 5000);
		};
		if (signal.aborted) killProc();
		else signal.addEventListener("abort", killProc, { once: true });
	}

	result.exitCode = await exitPromise;
	if (result.stderr.length > 4000) result.stderr = result.stderr.slice(-4000);
	return result;
}

// ── extension ───────────────────────────────────────────────────────────────

const WIDGET_KEY = "pi-subagent-status";
const REFRESH_INTERVAL_MS = 1000;

interface Job {
	id: number;
	kind: string;
	task: string;
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	status: "queued" | "running";
	createdAt: number;
	runStartedAt?: number;
	usage: UsageStats;
	turns: number;
	messages: Message[];
	stopReason?: string;
	errorMessage?: string;
	exitCode?: number;
	aborted?: boolean;
	controller?: AbortController;
}

function getFinalText(messages: Message[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			const text = msg.content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n");
			if (text.trim()) return text;
		}
	}
	return undefined;
}

const MAX_RESULT_TOOL_CALLS = 10;

function getToolCalls(messages: Message[]): { name: string; args: unknown }[] {
	const calls: { name: string; args: unknown }[] = [];
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		for (const part of msg.content) {
			if (part.type === "toolCall") calls.push({ name: part.name, args: part.arguments });
		}
	}
	return calls;
}

export default function (pi: ExtensionAPI, run = runChild, inputConfig: unknown = loadSubagentConfig()): void {
	// Set when spawned as a subagent child: never re-spawn, never transform.
	const isChild = process.env.PI_SUBAGENT_CHILD === "1";
	if (isChild) return;
	const config = normalizeSubagentConfig(inputConfig);

	pi.registerMessageRenderer<ResultDetails>("subagent-result", (message, { expanded, outputPad }, theme) => {
		const details = message.details;
		// Older entries lack separate display sections; retain their original content.
		if (typeof details?.headerText !== "string") return undefined;
		const visible = (mode: ResultVisibility) => mode === "always" || (mode === "expanded" && expanded);
		const box = new Box(outputPad, 1, text => theme.bg("customMessageBg", text));
		box.addChild(new Text(details.headerText, 0, 0));
		box.addChild(expanded
			? new Text(`Task: ${details.task}`, 0, 0)
			: new TruncatedText(`Task: ${collapseToolText(details.task)}`, 0, 0));
		if (details.failed) {
			const reason = details.reason || "Unknown error";
			box.addChild(new Text(theme.fg("error", `\nError: ${expanded ? reason : collapseToolText(reason, 160)}`), 0, 0));
		}
		if (visible(config.display.toolCalls) && details.toolCalls.length > 0) {
			box.addChild(new Text(`\nTool calls:\n${details.toolCalls.map(call => `→ ${call}`).join("\n")}`, 0, 0));
			if (details.toolCallCount > details.toolCalls.length) {
				box.addChild(new Text(theme.fg("muted", `[…showing last ${details.toolCalls.length} of ${details.toolCallCount} tool calls…]`), 0, 0));
			}
		}
		if (!details.failed && visible(config.display.finalResponse)) {
			box.addChild(new Text("\nFinal response:", 0, 0));
			box.addChild(new Markdown(details.finalText || "(no output)", 0, 0, getMarkdownTheme()));
		}
		if (!expanded) {
			box.addChild(new Text(theme.fg("muted", "Details collapsed (Ctrl+o to expand)"), 0, 0));
		}
		return box;
	});

	const jobs: Job[] = [];
	let nextJobId = 1;
	let closed = false;
	let ui: ExtensionUIContext | undefined;
	let widgetTui: { requestRender(force?: boolean): void } | undefined;
	let widgetInstalled = false;
	let spinnerTick = 0;
	let timer: ReturnType<typeof setInterval> | undefined;

	const activeJobs = () => jobs.filter((job) => job.status === "queued" || job.status === "running");

	const requestRender = () => widgetTui?.requestRender();

	const stopTimer = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};

	// The spinner only matters when the status bar is visible.
	const timerNeeded = () => config.display.statusBar !== "hidden";

	const clearWidget = () => {
		if (!widgetInstalled) return;
		widgetInstalled = false;
		widgetTui = undefined;
		ui?.setWidget(WIDGET_KEY, undefined);
	};

	const installWidget = () => {
		if (!ui || typeof ui.setWidget !== "function" || widgetInstalled) return;
		widgetInstalled = true;
		ui.setWidget(
			WIDGET_KEY,
			(tui: { requestRender(force?: boolean): void }) => {
				widgetTui = tui;
				return {
					render: (width: number) => {
						const views = activeJobs();
						if (views.length === 0) return [];
						const style: StatusStyler = makeStyler(ui?.theme);
						return buildStatusLines(
							views.map((job) => toStatusView(job, spinnerTick)),
							{ width, mode: config.display.statusBar === "oneline" ? "oneline" : "lines", style },
						);
					},
					invalidate() {},
				};
			},
			{ placement: "belowEditor" },
		);
	};

	const syncWidget = () => {
		if (!ui || config.display.statusBar === "hidden" || activeJobs().length === 0) {
			clearWidget();
			return;
		}
		installWidget();
		requestRender();
	};

	const startTimer = () => {
		if (!timerNeeded() || timer !== undefined) return;
		timer = setInterval(() => {
			spinnerTick++;
			requestRender();
		}, REFRESH_INTERVAL_MS);
		timer.unref?.();
	};

	const dequeue = () => {
		while (!closed) {
			const queued = jobs.find((job) => job.status === "queued");
			if (!queued || jobs.filter((job) => job.status === "running").length >= config.maxConcurrent) break;
			startJob(queued);
		}
		syncWidget();
	};

	function startJob(job: Job): void {
		job.status = "running";
		job.runStartedAt = Date.now();
		job.controller = new AbortController();
		syncWidget();
		startTimer();

		void run({
			kind: job.kind,
			task: job.task,
			cwd: job.cwd,
			model: job.model,
			thinkingLevel: job.thinkingLevel,
			signal: job.controller.signal,
			onMessage: () => {
				spinnerTick++;
				syncWidget();
			},
		})
			.then((result) => finishJob(job, result))
			.catch((error) => {
				if (job.aborted) return;
				finishJob(job, {
					exitCode: 1,
					messages: job.messages,
					stderr: "",
					usage: job.usage,
					turns: job.turns,
					errorMessage: error instanceof Error ? error.message : String(error),
					stopReason: "error",
					aborted: false,
				});
			});
	}

	function finishJob(job: Job, result: RunResult): void {
		job.messages = result.messages;
		job.usage = result.usage;
		job.turns = result.turns;
		job.stopReason = result.stopReason;
		job.errorMessage = result.errorMessage;
		job.exitCode = result.exitCode;
		const index = jobs.indexOf(job);
		if (index !== -1) jobs.splice(index, 1);
		if (!job.aborted && !result.aborted && !closed) {
			injectResult(job, result);
		}
		syncWidget();
		if (activeJobs().length === 0) {
			stopTimer();
			clearWidget();
		} else {
			dequeue();
		}
	}

	function injectResult(job: Job, result: RunResult): void {
		const failed = result.exitCode !== 0 || job.stopReason === "error";
		let reason: string | undefined;
		if (failed) {
			if (job.stopReason === "error" && job.errorMessage) reason = job.errorMessage;
			else if (job.stopReason && job.stopReason !== "end") reason = `stopped: ${job.stopReason}`;
			else if (job.exitCode !== 0) reason = result.stderr.trim() || `exit code ${job.exitCode}`;
		}
		reason = reason ? truncateMiddle(reason.trim(), 6000) : undefined;
		const elapsedMs = job.runStartedAt ? Date.now() - job.runStartedAt : 0;
		const toolCalls = getToolCalls(job.messages);
		const summary: InjectedSummary = {
			jobId: job.id,
			kind: job.kind,
			failed,
			reason,
			turns: job.turns,
			usage: job.usage,
			elapsedMs,
			finalText: truncateMiddle((getFinalText(job.messages) ?? "").trim(), 6000),
			toolCalls: toolCalls.slice(-MAX_RESULT_TOOL_CALLS),
			toolCallCount: toolCalls.length,
			toolCallMode: config.injectedToolCalls,
		};
		const content = buildInjectedContent(summary);
		try {
			pi.sendMessage(
				{
					customType: "subagent-result",
					content,
					display: true,
					details: {
						headerText: buildResultHeader(summary),
						toolCalls: summary.toolCalls.map(call => formatCompactToolCall(call.name, call.args)),
						toolCallCount: toolCalls.length,
						finalText: summary.failed ? "" : summary.finalText,
						jobId: job.id,
						kind: job.kind,
						task: job.task,
						status: failed ? "failed" : "done",
						failed,
						reason,
						exitCode: job.exitCode,
						stopReason: job.stopReason,
						model: result.model,
						turns: job.turns,
						usage: job.usage,
					},
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} catch (error) {
			ui?.notify?.(
				`Subagent ${job.kind} result injection failed: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
		if (failed) {
			ui?.notify?.(`Subagent ${job.kind} failed: ${reason ?? "unknown reason"}`, "error");
		}
	}

	function enqueue(kind: string, task: string, ctx: ExtensionContext): Job | undefined {
		if (closed || !ctx.cwd) return undefined;
		const job: Job = {
			id: nextJobId++,
			kind,
			task,
			cwd: ctx.cwd,
			model:
				config.model ??
				(ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined),
			thinkingLevel: config.thinking ?? ctx.thinkingLevel,
			status: "queued",
			createdAt: Date.now(),
			usage: { input: 0, output: 0, cost: 0 },
			turns: 0,
			messages: [],
		};
		jobs.push(job);
		dequeue();
		return job;
	}

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		exposure: "model-only",
		description: "Delegate a self-contained task to a background worker with isolated context. Returns a job ID and running/queued status immediately; the final result arrives automatically as a follow-up message. Provide all necessary context in the task; workers do not inherit the conversation. Workers cannot spawn subagents.",
		promptGuidelines: [
			"Prefer the subagent tool for independent, self-contained parts of a decomposable task. Continue other work while workers run; do not poll or spawn duplicate jobs to wait for results.",
		],
		parameters: Type.Object({
			task: Type.String({ minLength: 1, description: "Self-contained task with the context, paths, constraints, and expected output the worker needs" }),
			kind: Type.Optional(Type.String({ description: "Worker kind; defaults to worker. Currently only worker is supported." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Subagent dispatch cancelled");
			const task = params.task.trim();
			if (!task) throw new Error("Subagent task must not be empty");
			const kind = params.kind ?? "worker";
			if (!Object.hasOwn(SUBAGENT_KINDS, kind)) throw new Error(`Unknown subagent kind: ${kind}`);
			const job = enqueue(kind, task, ctx);
			if (!job) throw new Error("Cannot spawn subagent in the current session");
			return {
				content: [{ type: "text", text: `Subagent #${job.id} (${job.kind}) ${job.status} in background. The final result will arrive automatically as a follow-up; continue other work.` }],
				details: { jobId: job.id, kind: job.kind, status: job.status },
			};
		},
	});

	// Consume delegated input so the main agent does not execute the same task.
	pi.on("input", (event, ctx) => {
		if (isChild || event.source === "extension") return { action: "continue" };
		const { task, triggered } = splitTrailingAmpersand(event.text);
		if (!triggered) return { action: "continue" };
		if (!task.trim()) {
			if (ctx.hasUI) ctx.ui.notify("Subagent task is empty ('&' alone)", "warning");
			return { action: "handled" };
		}
		if (!enqueue("worker", task, ctx)) {
			return { action: "continue" };
		}
		if (ctx.hasUI) {
			ctx.ui.notify(`Subagent worker spawned in background: ${collapseTask(task)}`, "info");
		}
		return { action: "handled" };
	});

	pi.registerCommand("subagent", {
		description: "Run a background subagent. Usage: /subagent [kind:]task",
		handler: async (args, ctx) => {
			const { kind, task } = parseKindPrefix(args);
			if (!task.trim()) {
				if (ctx.hasUI) ctx.ui.notify("Usage: /subagent [kind:]task", "warning");
				return;
			}
			if (enqueue(kind, task, ctx)) {
				if (ctx.hasUI) ctx.ui.notify(`Subagent ${kind} spawned in background: ${collapseTask(task)}`, "info");
			} else if (ctx.hasUI) {
				ctx.ui.notify("Cannot spawn subagent right now", "warning");
			}
		},
	});

	const killAll = () => {
		closed = true;
		for (const job of jobs) {
			job.aborted = true;
			job.controller?.abort();
		}
		jobs.length = 0;
		stopTimer();
		clearWidget();
	};

	for (const event of ["session_before_switch", "session_before_fork", "session_before_tree", "session_shutdown"]) {
		pi.on(event, killAll);
	}
	pi.on("session_start", (_event, ctx) => {
		closed = false;
		ui = ctx.ui;
		syncWidget();
	});
}

function collapseTask(task: string): string {
	const oneLine = task.replace(/\s+/g, " ").trim();
	return oneLine.length > 48 ? `${oneLine.slice(0, 47)}…` : oneLine;
}

function toStatusView(job: Job, spinnerTick: number): StatusJobView {
	const running = job.status === "running";
	return {
		kind: job.kind,
		topic: collapseTask(job.task),
		status: job.status,
		elapsedMs: Date.now() - (running ? job.runStartedAt ?? job.createdAt : job.createdAt),
		input: job.usage.input,
		output: job.usage.output,
		spinner: running ? RUNNING_FRAMES[spinnerTick % RUNNING_FRAMES.length] : "·",
	};
}

function makeStyler(theme: { fg: (token: string, text: string) => string } | undefined): StatusStyler {
	const fg = (token: string, text: string) => theme ? theme.fg(token, text) : text;
	return (role, text) => {
		switch (role) {
			case "index":
				return fg("muted", text);
			case "spinner":
				return fg("warning", text);
			case "kind":
				return fg("accent", text);
			case "topic":
				return text;
			case "tokens":
				return fg("dim", text);
			case "time":
				return fg("muted", text);
			case "queued":
				return fg("dim", text);
		}
	};
}