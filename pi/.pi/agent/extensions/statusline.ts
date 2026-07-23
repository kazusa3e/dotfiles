/**
 * statusline — two-line custom footer, replaces pi-statusbar.
 *
 * Line 1 (identity / repo):   🐳/🏠 <pwd> · <git-branch> <git-diff>
 * Line 2 (model / perf):      <model-id> <thinking> · <context> · TTFT <ttft>s · <tps> TPS · <cost>
 *
 * Design:
 *   - Single self-contained file, no import from pi-statusbar internals.
 *   - TTFT/TPS tracker, color helpers, and 1Hz throttle ported from pi-statusbar.
 *   - Refresh is event-driven with a cache; render reads cache, passive renders
 *     do not re-shell-out to git.
 *   - Non-TUI modes stay silent and never register a footer.
 *
 * Environment variables: none (no segment configuration).
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { type AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/* ───────── Color helpers (RGB ANSI, same as pi-statusbar) ───────── */

const RESET = "\x1b[0m";
const SEP_COLOR = "\x1b[38;2;140;140;140m"; // grey, separator
const C_PWD = "\x1b[38;2;255;165;0m";        // orange
const C_MODEL = "\x1b[38;2;80;180;255m";     // blue
const C_GIT_BRANCH = "\x1b[38;2;86;182;194m"; // cyan #56B6C2
const C_GIT_DIFF = "\x1b[38;2;140;140;140m"; // grey

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** HSL → RGB, same as pi-statusbar. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; g1 = x; }
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

/* TTFT color: <2s green / 2-3 yellow / 3-4 orange / 4-5 red / ≥5 purple. */
function ttftAnsiColor(seconds: number): string {
  if (seconds >= 5) return rgb(200, 100, 255);
  if (seconds >= 4) return rgb(255, 80, 80);
  if (seconds >= 3) return rgb(255, 165, 0);
  if (seconds >= 2) return rgb(255, 215, 0);
  return rgb(80, 220, 80);
}

/* TPS color: dim grey when token count ≤ rate (short message, meaningless),
 * otherwise bucketed by rate. */
function tpsAnsiColor(rate: number, tokenCount: number): string {
  if (tokenCount <= rate) return rgb(140, 140, 140);
  if (rate < 15) return rgb(200, 100, 255);
  if (rate < 30) return rgb(255, 80, 80);
  if (rate < 45) return rgb(255, 165, 0);
  if (rate < 60) return rgb(255, 215, 0);
  if (rate < 75) return rgb(80, 180, 255);
  return rgb(80, 220, 80);
}

/* Context segment color: ≤75% default / >75% yellow / >85% orange / >95% red. */
function contextSectionColor(percent: number): string {
  if (percent > 95) return rgb(255, 80, 80);
  if (percent > 85) return rgb(255, 165, 0);
  if (percent > 75) return rgb(255, 215, 0);
  return "";
}

/* Cost is always red (pi-statusbar style, immediately visible). */
function costAnsiColor(): string {
  return rgb(255, 80, 80);
}

/* thinking level color (pi-statusbar style buckets). */
function thinkingColor(level: string): string {
  switch (level) {
    case "off": return rgb(140, 140, 140);
    case "minimal": case "min": return rgb(140, 140, 140);
    case "low": return rgb(180, 180, 180);
    case "medium": case "med": return rgb(80, 200, 200);
    case "high": return rgb(160, 120, 255);
    case "xhigh": case "extra-high": return rgb(220, 120, 220);
    default: return rgb(180, 180, 180);
  }
}

/* ───────── Text helpers ───────── */

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function middleTruncate(s: string, width: number): string {
  if (width <= 1) return s.slice(0, Math.max(0, width));
  if (s.length <= width) return s;
  const keep = width - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

/* Replace $HOME with ~, then middle-truncate when wider than maxWidth. */
function formatCwd(cwd: string, home: string, maxWidth: number): string {
  let display = cwd;
  if (home && (cwd === home || cwd.startsWith(home + "/"))) {
    display = "~" + cwd.slice(home.length);
  }
  return middleTruncate(display, maxWidth);
}

/* Normalize thinking level to its full word (pi-statusbar style). */
function normalizeEffortLevel(level: string): string {
  switch (level) {
    case "min": return "minimal";
    case "med": return "medium";
    case "xhigh": case "extra-high": return "xhigh";
    default: return level;
  }
}

/* Compact number: 1.0M / 9.2K / 999 */
function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

/* cost with 5-decimal tiers (pi-statusbar style). */
function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "$0";
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(5)}`;
}

function sessionCostFromBranch(branch: readonly unknown[]): number {
  let total = 0;
  for (const entry of branch) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (rec.type !== "message") continue;
    const message = rec.message as Record<string, unknown> | undefined;
    if (!message || message.role !== "assistant") continue;
    const usage = message.usage as { cost?: { total?: number } } | undefined;
    const cost = usage?.cost?.total;
    if (typeof cost === "number" && Number.isFinite(cost)) total += cost;
  }
  return total;
}

/* ───────── Container detection ───────── */

function detectContainerEnv(): "docker" | "local" {
  try {
    if (existsSync("/.dockerenv")) return "docker";
    const cgroup = readFileSync("/proc/1/cgroup", "utf8");
    if (/docker|containerd|kubepods|overlay-containers/.test(cgroup)) return "docker";
    const mountinfo = readFileSync("/proc/1/mountinfo", "utf8");
    if (/overlay-containers|docker\//.test(mountinfo)) return "docker";
  } catch { /* not available — assume host */ }
  return "local";
}

const ENV_ICON = detectContainerEnv() === "docker" ? "🐳 " : "🏠 ";
// emoji takes 2 columns + 1 trailing space = 3
const ENV_ICON_WIDTH = 3;

/* ───────── git status cache ───────── */

type GitCache = {
  branch: string | null;
  diff: string | null;
  lines: { added: number; deleted: number } | null;
};

let gitCache: GitCache = { branch: null, diff: null, lines: null };
let gitInFlight = false;
// cwd -> { diff: "3M2A1D", lines: { added, deleted } }
const gitDiffCache = new Map<string, { diff: string; lines: { added: number; deleted: number } }>();

/** Run `git status --porcelain` and `git diff HEAD --numstat` asynchronously
 * (one fork combined via `git -c ...`) and update the cache. Silently fails
 * (marks cwd as no-diff). */
function refreshGitDiff(cwd: string, onUpdate: () => void): void {
  if (gitInFlight) return;
  gitInFlight = true;
  execFile("git", ["status", "--porcelain"], { cwd }, (errStatus, statusOut) => {
    if (errStatus) {
      gitInFlight = false;
      // Silent failure: mark this cwd as no-diff.
      gitDiffCache.set(cwd, { diff: "", lines: { added: 0, deleted: 0 } });
      gitCache = { ...gitCache, diff: "", lines: { added: 0, deleted: 0 } };
      onUpdate();
      return;
    }
    // Second fork: line-level stats vs HEAD. Error here (e.g. empty repo with
    // no HEAD) is non-fatal; we just keep zero line counts.
    execFile("git", ["diff", "HEAD", "--numstat"], { cwd }, (errNumstat, numstatOut) => {
      gitInFlight = false;
      const diff = parseGitStatusPorcelain(statusOut);
      const lines = errNumstat ? { added: 0, deleted: 0 } : parseGitDiffNumstat(numstatOut);
      gitDiffCache.set(cwd, { diff, lines });
      gitCache = { ...gitCache, diff, lines };
      onUpdate();
    });
  });
}

/** Parse `git diff HEAD --numstat` → { added, deleted }, summing binary
 * entries as zero both sides. */
function parseGitDiffNumstat(out: string): { added: number; deleted: number } {
  let added = 0, deleted = 0;
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const a = Number(parts[0]);
    const d = Number(parts[1]);
    // Binary files report "-\t-\tfile"; Number("-") = NaN, skip them.
    if (Number.isFinite(a)) added += a;
    if (Number.isFinite(d)) deleted += d;
  }
  return { added, deleted };
}

/** Count first-column chars → `3M2A1D`; empty string if no changes. */
function parseGitStatusPorcelain(out: string): string {
  if (!out.trim()) return "";
  let m = 0, a = 0, d = 0, other = 0;
  for (const line of out.split("\n")) {
    if (!line) continue;
    const c = line[0];
    if (c === "M" || c === " ") m++;   // M column: modified; space but second column M also counts
    else if (c === "A") a++;
    else if (c === "D") d++;
    else other++;
    // Also count second-column D/M/A, merged vs HEAD.
    const c2 = line[1];
    if (c2 === "M" && c !== "M") m++;
    else if (c2 === "A" && c !== "A") a++;
    else if (c2 === "D" && c !== "D") d++;
  }
  const parts: string[] = [];
  if (m) parts.push(`${m}M`);
  if (a) parts.push(`${a}A`);
  if (d) parts.push(`${d}D`);
  if (other) parts.push(`${other}?`);
  return parts.join("");
}

/* ───────── TTFT/TPS tracker (ported from pi-statusbar) ───────── */

class TokenRateTracker {
  private _isStreaming = false;
  private _lastCompletedRate = 0;
  private _lastCompletedTokenCount = 0;
  private _lastTTFT: number | null = null;
  private _hasData = false;
  private _ttftSamples: number[] = [];
  private _tpsSamples: number[] = [];
  private _turnStartMs: number | null = null;
  private _callStartMs: number | null = null;
  private _firstDeltaMs: number | null = null;
  private _toolExecStartMs: number | null = null;
  private _totalPauseMs = 0;
  private _turnTokens = 0;
  private _destroyed = false;

  get ttft(): number | null { return this._lastTTFT; }
  get tps(): number { return this._lastCompletedRate; }

  liveTps(now: number = performance.now()): number {
    if (!this._isStreaming) return this._lastCompletedRate;
    if (this._firstDeltaMs == null) return this._lastCompletedRate || 0;
    const pauseMs = this._totalPauseMs + (this._toolExecStartMs != null ? now - this._toolExecStartMs : 0);
    const elapsed = Math.max(1, now - this._firstDeltaMs - pauseMs);
    const rate = this._turnTokens / (elapsed / 1000);
    if (rate === 0 && this._lastCompletedRate > 0) return this._lastCompletedRate;
    return rate;
  }

  liveTokenCount(): number {
    if (!this._isStreaming) return this._lastCompletedTokenCount;
    return Math.max(this._turnTokens, this._lastCompletedTokenCount);
  }

  start(turnStartMs: number): void {
    if (this._destroyed) return;
    const wasStreaming = this._isStreaming;
    this._isStreaming = true;
    if (!wasStreaming) {
      this._turnStartMs = turnStartMs;
      this._callStartMs = turnStartMs;
      this._firstDeltaMs = null;
      this._toolExecStartMs = null;
      this._totalPauseMs = 0;
      this._turnTokens = 0;
      this._ttftSamples = [];
      this._tpsSamples = [];
      // Keep _lastTTFT / _lastCompletedRate from the previous turn until new
      // samples overwrite them.
    }
  }

  record(event: AssistantMessageEvent): void {
    if (event.type !== "text_delta" && event.type !== "thinking_delta" && event.type !== "toolcall_delta") return;
    if (!this._isStreaming || this._turnStartMs == null) this.start(performance.now());
    const now = performance.now();
    if (this._firstDeltaMs == null && this._callStartMs != null) {
      this._firstDeltaMs = now;
      const callTTFT = (now - this._callStartMs) / 1000;
      this._ttftSamples.push(callTTFT);
      this._lastTTFT = this._ttftSamples.reduce((s, v) => s + v, 0) / this._ttftSamples.length;
    }
    if (event.partial.usage?.output) {
      this._turnTokens = event.partial.usage.output;
    }
  }

  pauseForTool(): void {
    if (!this._isStreaming) return;
    if (this._toolExecStartMs != null) return;
    this._toolExecStartMs = performance.now();
  }

  resumeAfterTool(): void {
    if (!this._isStreaming || this._toolExecStartMs == null) return;
    this._totalPauseMs += performance.now() - this._toolExecStartMs;
    this._toolExecStartMs = null;
    this._callStartMs = performance.now();
  }

  stop(turnEndMs: number, providerOutputTokens: number | null): void {
    if (this._toolExecStartMs != null) {
      this._totalPauseMs += turnEndMs - this._toolExecStartMs;
      this._toolExecStartMs = null;
    }
    if (this._firstDeltaMs == null) {
      this._turnTokens = 0;
      return;
    }
    const streamingSeconds = Math.max(0.001, (turnEndMs - this._firstDeltaMs - this._totalPauseMs) / 1000);
    const turnTokens = (providerOutputTokens != null && providerOutputTokens > this._turnTokens)
      ? providerOutputTokens
      : this._turnTokens;
    if (turnTokens > 0 && streamingSeconds > 0) {
      const callTps = turnTokens / streamingSeconds;
      this._tpsSamples.push(callTps);
      this._lastCompletedRate = this._tpsSamples.reduce((s, v) => s + v, 0) / this._tpsSamples.length;
      this._lastCompletedTokenCount = turnTokens;
      this._hasData = true;
    }
    this._firstDeltaMs = null;
    this._totalPauseMs = 0;
    this._turnTokens = 0;
    this._callStartMs = performance.now();
  }

  cancel(): void {
    this._isStreaming = false;
    this._turnStartMs = null;
    this._callStartMs = null;
    this._firstDeltaMs = null;
    this._toolExecStartMs = null;
    this._totalPauseMs = 0;
    this._turnTokens = 0;
  }

  reset(): void {
    this._lastCompletedRate = 0;
    this._lastCompletedTokenCount = 0;
    this._lastTTFT = null;
    this._hasData = false;
    this._ttftSamples = [];
    this._tpsSamples = [];
    this.cancel();
  }

  destroy(): void {
    this._destroyed = true;
    this._isStreaming = false;
  }
}

/* ───────── Main extension ───────── */

const FOOTER_REPAINT_MS = 1000;
const SEP = ` ${SEP_COLOR}·${RESET} `;

export default function (pi: ExtensionAPI) {
  const tracker = new TokenRateTracker();
  let requestRender: (() => void) | undefined;
  let lastPaintedAt = 0;
  let needsRecompute = true;
  let cachedLines: string[] | null = null;
  let cachedWidth = -1;

  const refresh = (force = false) => {
    if (!requestRender) return;
    if (!force && performance.now() - lastPaintedAt < FOOTER_REPAINT_MS) return;
    lastPaintedAt = performance.now();
    needsRecompute = true;
    requestRender();
  };

  /** Compose one line: keep segments in priority order, drop tails on overflow. */
  function composeLine(segments: string[], width: number): string {
    // segments are finished chunks with ANSI; add them one by one, stop when the
    // next one would exceed the width.
    let line = "";
    let used = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segWidth = visibleWidth(stripAnsi(seg));
      const need = segWidth + (i > 0 ? visibleWidth(stripAnsi(SEP)) : 0);
      if (used + need > width && line.length > 0) break;
      line += (i > 0 ? SEP : "") + seg;
      used += need;
    }
    return line;
  }

  pi.on("model_select", async () => {
    tracker.reset();
    refresh(true);
  });
  pi.on("thinking_level_select", async () => refresh(true));
  pi.on("turn_start", async () => {
    tracker.start(performance.now());
  });
  pi.on("turn_end", async () => {
    tracker.cancel();
    refresh(true);
  });
  pi.on("tool_execution_start", async () => tracker.pauseForTool());
  pi.on("tool_execution_end", async () => tracker.resumeAfterTool());
  pi.on("message_update", async (event) => {
    tracker.record(event.assistantMessageEvent);
    refresh();
  });
  pi.on("message_end", async (event) => {
    if (event.message?.role === "assistant") {
      const providerOutput = event.message.usage?.output ?? null;
      tracker.stop(performance.now(), providerOutput);
    }
    refresh(true);
  });
  pi.on("session_before_tree", async () => tracker.cancel());

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    tracker.reset();
    needsRecompute = true;

    ctx.ui.setFooter((tui, _theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubBranch = footerData.onBranchChange(() => {
        gitCache = { ...gitCache, branch: footerData.getGitBranch() };
        refreshGitDiff(ctx.cwd, () => refresh(true));
        refresh(true);
      });

      return {
        dispose() {
          unsubBranch();
          requestRender = undefined;
          cachedLines = null;
          cachedWidth = -1;
        },
        invalidate() {},
        render(width: number): string[] {
          if (!needsRecompute && width === cachedWidth && cachedLines !== null) {
            return cachedLines.map((l) => truncateToWidth(l, width));
          }
          needsRecompute = false;
          cachedWidth = width;

          // Pull fresh data.
          const cached = gitDiffCache.get(ctx.cwd);
          gitCache = {
            branch: footerData.getGitBranch(),
            diff: cached?.diff ?? null,
            lines: cached?.lines ?? null,
          };

          /* === Line 1: env + pwd · git-branch git-diff === */
          // pwd width budget = total width - git segment(s) - separator. Reserve
          // the emoji prefix first.
          const branchText = gitCache.branch && gitCache.branch !== "detached"
            ? gitCache.branch : (gitCache.branch === "detached" ? "detached" : null);
          const diffText = gitCache.diff && gitCache.diff.length > 0 ? gitCache.diff : null;
          const lines = gitCache.lines;
          const linesText = lines && (lines.added > 0 || lines.deleted > 0)
            ? `+${lines.added}/-${lines.deleted}`
            : null;

          const gitSegs: string[] = [];
          if (branchText) {
            gitSegs.push(`${C_GIT_BRANCH}${branchText}${RESET}`);
          }
          if (diffText) {
            gitSegs.push(`${C_GIT_DIFF}${diffText}${RESET}`);
          }
          if (linesText) {
            gitSegs.push(`${C_GIT_DIFF}${linesText}${RESET}`);
          }
          // space, not separator, between branch and diff
          const gitCombined = gitSegs.join(" ");
          const gitWidth = gitCombined ? visibleWidth(stripAnsi(gitCombined)) : 0;
          const reserved = gitWidth > 0 ? visibleWidth(stripAnsi(SEP)) + gitWidth : 0;
          const pwdMax = Math.max(8, width - reserved - ENV_ICON_WIDTH);
          const pwdDisplay = formatCwd(ctx.cwd, homedir(), pwdMax);
          const pwdSeg = `${C_PWD}${ENV_ICON}${pwdDisplay}${RESET}`;

          const line1Segs = [pwdSeg];
          if (gitCombined) line1Segs.push(gitCombined);
          const line1 = composeLine(line1Segs, width);

          /* === Line 2: model thinking · context · ttft · tps · cost === */
          const modelId = ctx.model?.id ?? "no-model";
          const effort = normalizeEffortLevel(String(pi.getThinkingLevel()));
          const modelSeg = `${C_MODEL}${modelId}${RESET} ${thinkingColor(effort)}${effort}${RESET}`;

          // context
          const usage = ctx.getContextUsage();
          let contextSeg: string;
          if (usage && usage.percent !== null) {
            const pct = `${usage.percent.toFixed(1)}%`;
            const win = formatTokens(usage.contextWindow);
            const color = contextSectionColor(usage.percent);
            const text = `${pct} of ${win} used`;
            contextSeg = color ? `${color}${text}${RESET}` : text;
          } else if (usage) {
            contextSeg = `— of ${formatTokens(usage.contextWindow)} used`;
          } else {
            contextSeg = "—";
          }

          // ttft + tps
          const ttft = tracker.ttft;
          const ttftStr = ttft != null
            ? (ttft >= 100 ? `${Math.round(ttft)}s` : `${ttft.toFixed(2)}s`)
            : "0.00s";
          const ttftSeg = `${ttftAnsiColor(ttft ?? 0)}TTFT ${ttftStr}${RESET}`;

          const displayRate = tracker.liveTps();
          const displayTokenCount = tracker.liveTokenCount();
          const CAP = 9999;
          const displayLabel = displayRate > CAP ? `${CAP}+` : `${Math.min(CAP, Math.round(displayRate))}`;
          const tpsSeg = `${tpsAnsiColor(displayRate, displayTokenCount)}${displayLabel} TPS${RESET}`;

          // cost
          const cost = sessionCostFromBranch(ctx.sessionManager.getBranch());
          const costSeg = `${costAnsiColor()}${formatCost(cost)}${RESET}`;

          // Line 2 priority: model > thinking (already part of model segment) >
          //   context > ttft > tps > cost
          const line2Segs = [modelSeg, contextSeg, ttftSeg, tpsSeg, costSeg];
          const line2 = composeLine(line2Segs, width);

          cachedLines = [line1, line2];
          return cachedLines.map((l) => truncateToWidth(l, width));
        },
      };
    });

    // Initial git fetch (non-blocking; requestRender after backfill).
    refreshGitDiff(ctx.cwd, () => refresh(true));
    refresh(true);
  });

  pi.on("session_shutdown", async () => {
    tracker.destroy();
    requestRender = undefined;
  });
}