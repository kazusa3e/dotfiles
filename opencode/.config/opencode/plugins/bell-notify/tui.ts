import { writeSync } from "node:fs";
import type { Plugin } from "@opencode/plugin/tui";

export default {
  id: "dotfiles.bell-notify",
  setup(ctx: Plugin.Context) {
    const finished = new Set<string>();
    const pending = new Set<string>();

    function belongs(sessionID: string): boolean {
      const route = ctx.ui.router.current();
      return route.type === "session" &&
        ctx.data.session.root(sessionID) === ctx.data.session.root(route.sessionID);
    }

    function bell(): void {
      // Bypass OpenTUI's stdout capture so BEL reaches the terminal.
      if (process.stdout.isTTY) writeSync(process.stdout.fd, "\x07");
    }

    function finish(sessionID: string, notify = true): void {
      if (!belongs(sessionID) || ctx.data.session.root(sessionID) !== sessionID || finished.has(sessionID)) return;
      finished.add(sessionID);
      if (notify) bell();
    }

    function prompt(sessionID: string, key: string): void {
      if (!belongs(sessionID) || pending.has(key)) return;
      pending.add(key);
      bell();
    }

    const dispose = [
      ctx.data.on("session.execution.started", (event) => finished.delete(event.data.sessionID)),
      ctx.data.on("session.execution.succeeded", (event) => {
        const sessionID = event.data.sessionID;
        // A running child will wake its parent again; this is not settled yet.
        const runningChild = ctx.data.session.family(sessionID).some((childID) =>
          ctx.data.session.get(childID)?.parentID === sessionID && ctx.data.session.status(childID) === "running"
        );
        if (!runningChild) finish(sessionID);
      }),
      ctx.data.on("session.execution.failed", (event) => finish(event.data.sessionID)),
      ctx.data.on("session.execution.interrupted", (event) => finish(event.data.sessionID, false)),
      ctx.data.on("permission.asked", (event) => prompt(event.data.sessionID, `permission:${event.data.id}`)),
      ctx.data.on("permission.replied", (event) => pending.delete(`permission:${event.data.requestID}`)),
      ctx.data.on("form.created", (event) => prompt(event.data.form.sessionID, `form:${event.data.form.id}`)),
      ctx.data.on("form.replied", (event) => pending.delete(`form:${event.data.id}`)),
      ctx.data.on("form.cancelled", (event) => pending.delete(`form:${event.data.id}`)),
    ];

    return () => dispose.reverse().forEach((cleanup) => cleanup());
  },
} satisfies Plugin.Definition;
