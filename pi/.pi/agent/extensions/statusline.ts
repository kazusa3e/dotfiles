/**
 * statusline — two-line custom footer, replaces pi-statusbar.
 *
 * Line 1 (session / repo):    Session: <title> · 🐳/🏠 <pwd> · <git-branch> <git-diff>
 * Line 2 (model / perf):      <provider>/<model-id> <thinking> · <context> · TTFT <ttft>s · <tps> TPS · <cost>
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
const C_SESSION = "\x1b[38;2;180;140;255m";   // violet
const C_MODEL = "\x1b[38;2;80;180;255m";      // blue
const C_GIT_BRANCH = "\x1b[38;2;86;182;194m"; // cyan #56B6C2
const C_GIT_DIFF = "\x1b[38;2;140;140;140m";  // grey

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
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

function middleTruncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(s) <= width) return s;
  if (width === 1) return "…";

  const chars = Array.from(s);
  const take = (start: number, step: 1 | -1, budget: number) => {
    let text = "";
    let used = 0;
    for (let i = start; i >= 0 && i < chars.length; i += step) {
      const char = chars[i]!;
      const charWidth = visibleWidth(char);
      if (used + charWidth > budget) break;
      text = step === 1 ? text + char : char + text;
      used += charWidth;
    }
    return text;
  };

  const keep = width - 1;
  return take(0, 1, Math.ceil(keep / 2)) + "…" + take(chars.length - 1, -1, Math.floor(keep / 2));
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
    if (!message) continue;
    const usage = message.usage as { cost?: { total?: number } } | undefined;
    const cost = usage?.cost?.total;
    if (typeof cost === "number" && Number.isFinite(cost)) total += cost;
  }
  return total;
}

/* Aggregate prompt-cache stats across the session branch.
 * Cache hit rate = cacheRead / (input + cacheRead + cacheWrite), i.e. the
 * fraction of total input-side tokens served from the cache. Returns null when
 * the session has no cacheable input yet (denominator 0). */
function sessionCacheFromBranch(branch: readonly unknown[]):
  { rate: number; read: number; total: number } | null {
  let read = 0, input = 0, write = 0;
  for (const entry of branch) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (rec.type !== "message") continue;
    const message = rec.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const usage = message.usage as
      { input?: number; cacheRead?: number; cacheWrite?: number } | undefined;
    if (!usage) continue;
    if (typeof usage.input === "number" && Number.isFinite(usage.input)) input += usage.input;
    if (typeof usage.cacheRead === "number" && Number.isFinite(usage.cacheRead)) read += usage.cacheRead;
    if (typeof usage.cacheWrite === "number" && Number.isFinite(usage.cacheWrite)) write += usage.cacheWrite;
  }
  const total = input + read + write;
  if (total <= 0) return null;
  return { rate: read / total, read, total };
}

/* Cache rate color: ≥80% green / ≥50% blue / ≥25% yellow / else grey. */
function cacheRateColor(rate: number): string {
  if (rate >= 0.8) return rgb(80, 220, 80);
  if (rate >= 0.5) return rgb(80, 180, 255);
  if (rate >= 0.25) return rgb(255, 215, 0);
  return rgb(140, 140, 140);
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

type GitDiff = {
  diff: string;
  lines: { added: number; deleted: number };
};

type GitRefresh = {
  callbacks: Set<() => void>;
  inFlight: boolean;
  pending: boolean;
};

// cwd -> { diff: "M3 A2 D1", lines: { added, deleted } }
const gitDiffCache = new Map<string, GitDiff>();
const gitRefreshes = new Map<string, GitRefresh>();

/** Refresh a cwd's git cache. Concurrent requests are coalesced, then rerun
 * once when changes arrive during the in-flight request. */
function refreshGitDiff(cwd: string, onUpdate: () => void): void {
  let refresh = gitRefreshes.get(cwd);
  if (!refresh) {
    refresh = { callbacks: new Set(), inFlight: false, pending: false };
    gitRefreshes.set(cwd, refresh);
  }
  refresh.callbacks.add(onUpdate);
  if (refresh.inFlight) {
    refresh.pending = true;
    return;
  }
  runGitRefresh(cwd, refresh);
}

function runGitRefresh(cwd: string, refresh: GitRefresh): void {
  refresh.inFlight = true;
  execFile("git", ["status", "--porcelain"], { cwd }, (errStatus, statusOut) => {
    if (errStatus) {
      finishGitRefresh(cwd, refresh, { diff: "", lines: { added: 0, deleted: 0 } });
      return;
    }
    // Line-level stats against HEAD exclude untracked files. An empty repository
    // has no HEAD, so failure here still leaves the file-status summary intact.
    execFile("git", ["diff", "HEAD", "--numstat"], { cwd }, (errNumstat, numstatOut) => {
      finishGitRefresh(cwd, refresh, {
        diff: parseGitStatusPorcelain(statusOut),
        lines: errNumstat ? { added: 0, deleted: 0 } : parseGitDiffNumstat(numstatOut),
      });
    });
  });
}

function finishGitRefresh(cwd: string, refresh: GitRefresh, result: GitDiff): void {
  gitDiffCache.set(cwd, result);
  refresh.inFlight = false;
  const callbacks = [...refresh.callbacks];
  refresh.callbacks.clear();
  const rerun = refresh.pending;
  refresh.pending = false;
  if (rerun) runGitRefresh(cwd, refresh);
  else gitRefreshes.delete(cwd);
  for (const callback of callbacks) callback();
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

/** Parse `git status --porcelain` → space-separated `M5 A20 D13 ?5`; empty string if clean.
 *
 * Uses a single-pass per-file hierarchy:
 *   1. ?? (untracked)           → other (?)
 *   2. D in either column       → deleted (D)
 *   3. A in staged column       → added (A)
 *   4. M in either column       → modified (M)
 *   5. Other non-space states    → other (?)
 *
 * This avoids the double-counting bug of the previous implementation
 * which counted ` M` (unstaged modification) twice. */
function parseGitStatusPorcelain(out: string): string {
  if (!out.trim()) return "";
  let modified = 0, added = 0, deleted = 0, other = 0;
  for (const line of out.split("\n")) {
    if (!line) continue;
    const staged = line[0];   // index/staging status
    const worktree = line[1]; // work tree status

    // Untracked
    if (staged === "?" && worktree === "?") { other++; continue; }
    // Ignored — skip entirely
    if (staged === "!" && worktree === "!") continue;
    // Deleted (either staged or in worktree)
    if (staged === "D" || worktree === "D") { deleted++; continue; }
    // Added (staged as new file)
    if (staged === "A") { added++; continue; }
    // Modified (either column)
    if (staged === "M" || worktree === "M") { modified++; continue; }
    // Renamed, copied, unmerged, etc.
    if (staged !== " " || worktree !== " ") { other++; continue; }
  }

  const parts: string[] = [];
  if (modified) parts.push(`M${modified}`);
  if (added) parts.push(`A${added}`);
  if (deleted) parts.push(`D${deleted}`);
  if (other) parts.push(`?${other}`);
  return parts.join(" ");
}

/* ───────── TTFT/TPS tracker (ported from pi-statusbar) ───────── */

class TokenRateTracker {
  private _isStreaming = false;
  private _lastCompletedRate = 0;
  private _lastCompletedTokenCount = 0;
  private _lastTTFT: number | null = null;
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
      const segWidth = visibleWidth(seg);
      const need = segWidth + (i > 0 ? visibleWidth(SEP) : 0);
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
  pi.on("session_info_changed", async () => refresh(true));
  pi.on("turn_start", async () => {
    tracker.start(performance.now());
  });
  pi.on("turn_end", async (_event, ctx) => {
    tracker.cancel();
    refreshGitDiff(ctx.cwd, () => refresh(true));
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
        invalidate() {
          needsRecompute = true;
          cachedLines = null;
          cachedWidth = -1;
        },
        render(width: number): string[] {
          if (!needsRecompute && width === cachedWidth && cachedLines !== null) {
            return cachedLines.map((l) => truncateToWidth(l, width));
          }
          needsRecompute = false;
          cachedWidth = width;

          /* === Line 1: session · env + pwd · git-branch git-diff === */
          const cached = gitDiffCache.get(ctx.cwd);
          const branch = footerData.getGitBranch();
          const branchText = branch === "detached" ? "detached" : branch;
          const diffText = cached?.diff || null;
          const lines = cached?.lines ?? null;
          const linesText = lines && (lines.added > 0 || lines.deleted > 0)
            ? `+${lines.added}/-${lines.deleted}`
            : null;

          const gitSegs: string[] = [];
          if (branchText) gitSegs.push(`${C_GIT_BRANCH}${branchText}${RESET}`);
          if (diffText) gitSegs.push(`${C_GIT_DIFF}${diffText}${RESET}`);
          if (linesText) gitSegs.push(`${C_GIT_DIFF}${linesText}${RESET}`);
          // Space, not separator, between branch and diff details.
          const gitCombined = gitSegs.join(" ");

          const sessionName = pi.getSessionName();
          const sessionText = sessionName
            ? truncateToWidth(`Session: ${sessionName}`, Math.max(0, Math.floor(width * 0.35)))
            : null;
          const sessionSeg = sessionText ? `${C_SESSION}${sessionText}${RESET}` : null;
          const sessionWidth = sessionSeg ? visibleWidth(sessionSeg) : 0;
          const gitWidth = gitCombined ? visibleWidth(gitCombined) : 0;
          const separatorWidth = visibleWidth(SEP);
          const reserved = (sessionSeg ? sessionWidth + separatorWidth : 0)
            + (gitCombined ? gitWidth + separatorWidth : 0);
          const pwdMax = Math.max(0, width - reserved - ENV_ICON_WIDTH);
          const pwdDisplay = formatCwd(ctx.cwd, homedir(), pwdMax);
          const pwdSeg = `${C_PWD}${ENV_ICON}${pwdDisplay}${RESET}`;

          const line1Segs = [sessionSeg, pwdSeg, gitCombined].filter((seg): seg is string => Boolean(seg));
          const line1 = composeLine(line1Segs, width);

          /* === Line 2: provider/model thinking · context · ttft · tps · cost === */
          const modelLabel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
          const effort = normalizeEffortLevel(String(pi.getThinkingLevel()));
          const modelSeg = `${C_MODEL}${modelLabel}${RESET} ${thinkingColor(effort)}${effort}${RESET}`;

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

          // cache hit rate
          const cache = sessionCacheFromBranch(ctx.sessionManager.getBranch());
          let cacheSeg: string;
          if (cache) {
            const pct = `${(cache.rate * 100).toFixed(0)}%`;
            const label = `Cache ${pct}`;
            cacheSeg = `${cacheRateColor(cache.rate)}${label}${RESET}`;
          } else {
            cacheSeg = `${cacheRateColor(0)}Cache —${RESET}`;
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
          const line2Segs = [modelSeg, contextSeg, cacheSeg, ttftSeg, tpsSeg, costSeg];
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