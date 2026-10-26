import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function notify(ctx: ExtensionContext): void {
	if (ctx.mode === "tui" && process.stdout.isTTY) {
		process.stdout.write("\x07");
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_settled", (event, ctx) => {
		if (!event.aborted) notify(ctx);
	});

	pi.on("ui_prompt_start", (_event, ctx) => {
		notify(ctx);
	});
}
