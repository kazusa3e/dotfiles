import type { Plugin } from "@opencode-ai/plugin"

export const NotifyPlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`qnotify "opencode" "Session completed"`.quiet()
      } else if (event.type === "session.error") {
        await $`qnotify "opencode" "Session error"`.quiet()
      } else if (event.type === "permission.updated") {
        await $`qnotify "opencode" "Needs your confirmation"`.quiet()
      }
    },
  }
}
