# Discord Integration Guide

## Purpose

Discord is an external Studio chat client.

- it does not create, edit, save, or publish APM Studio assets
- it reuses Studio Agent and Team chat runtime services
- Studio web owns configuration and sync controls

## Source Of Truth

- user-facing setup guide: `DISCORD_INTEGRATION.md`
- settings UI: `src/components/modals/SettingsDiscord.tsx`
- API routes: `server/routes/discord.ts`
- bot lifecycle and Discord event handling: `server/services/discord/discord-service.ts`
- config storage: `~/.apm-studio/discord-config.json`
- channel/role mappings: `~/.apm-studio/discord-mappings.json`

## Configuration

Discord is configured from the Studio web Settings modal.

- token is write-only from the client perspective
- API responses must return only `hasToken`
- one selected Discord server is supported in v1
- config and mapping files are written under the APM Studio config directory with private file permissions
- Studio enforces Discord actor authorization before handling control, command, or chat events
- default access requires Discord `Manage Server`
- configured role IDs and user IDs may be used as explicit allowlist exceptions

The bot needs:

- Manage Channels
- Send Messages
- Read Message History
- Message Content privileged intent
- application commands scope

## Discord Shape

Workspace sync creates:

- one active workspace category
- one archived category for channels from inactive workspaces
- one shared `studio-control` channel with a workspace switcher
- one category per Agent, prefixed with `👤` and named after that Agent
- one category per Team, prefixed with `👥` and named after that Team
- lazily-created thread channels under those Agent and Team categories as threads are opened
- `/team message` agent autocomplete for Team thread input, scoped to the mapped Team channel
- Discord-visible category and channel names avoid Studio-specific text prefixes such as `apm`, `t-`, and `a-`
- unnamed Discord-created thread channels use numbered `new-thread-N` names instead of Studio/OpenCode metadata ids
- sync keeps the active workspace root category scoped to the selected workspace across workspace switches
- sync removes active-workspace Discord thread channels and adapter mappings when the corresponding Studio standalone Agent session or Team thread no longer exists
- sync treats unreadable active thread lists as unknown instead of stale, and only prunes adapter mappings after the Discord channel is confirmed deleted or already missing
- sync positions the archive category at the bottom of the Discord category list
- sync moves inactive workspace thread channels to the archive, removes inactive Agent and Team categories only after Discord confirms deletion, and deletes unmapped empty Studio Agent/Team categories

Packages is intentionally not projected to Discord.

## Slash Commands

Discord slash commands are grouped by Studio scope:

- `/workspace active` reports the active saved workspace.
- `/workspace control` refreshes the `studio-control` panel for the current or active workspace.
- `/workspace sync` syncs the active workspace and refreshes the workspace selector.
- `/workspace switch workspace:<id-or-folder>` switches to a saved workspace by exact workspace id, working directory, or folder name.
- `/agent new` creates a fresh standalone Agent thread and is accepted only in mapped Agent thread channels.
- `/team participants` lists agents for the current Team and is accepted only in mapped Team thread channels.
- `/team message agent:<agent> message:<text>` sends a message to one agent in the current Team thread. The agent option uses channel-scoped autocomplete from the mapped Team only.
- `/team sync` backfills recent visible agent messages and is accepted only in mapped Team thread channels.

Commands must still pass the selected-server and actor authorization checks before they can read mappings or call Studio runtime services.

## Runtime Rules

Standalone Agent messages use:

`createStudioChatSession` -> `sendStudioChatMessage`

Team participant modal submissions use:

`buildActParticipantChatKey(...)` -> `createStudioChatSession` -> `sendStudioChatMessage`

When an Agent or Team thread channel is opened:

- Discord reuses the mapped session when one exists
- standalone Agent categories list saved Studio Agent sessions as channels
- Discord refreshes thread channel names from Studio thread titles after the first message
- recent text-only Studio history is backfilled into Discord by the bot, capped at 20 messages
- tool output, reasoning, system-only content, and prior permission/question metadata are not backfilled
- backfilled message ids are stored in `discord-mappings.json` to avoid duplicates
- Team thread history sync is assistant-output-only per agent; Discord user input is posted by the bot as normalized `[APM User -> Agent]` text, while runtime-injected user prompts such as teammate wake/direct-message prompts stay hidden

When a session pauses for user input:

- pending permissions are rendered as Discord buttons and answered through `respondSessionPermission`
- pending single-option questions are rendered as Discord select menus, with `Other` opening a text modal when custom input is allowed
- pending free-text or multi-question prompts are rendered as Discord modals and answered through `respondQuestion` or `rejectQuestion`
- Discord stores only adapter metadata for pending prompt buttons in `discord-mappings.json`
- Discord waits through a short idle grace period before declaring a run finished without text, because OpenCode can expose a permission/question prompt just after the session first appears idle
- if a Discord channel is already blocked on a pending permission or question but no prompt mapping exists for that channel, Discord reposts the prompt controls instead of only telling the user to use buttons
- pending prompt metadata is timestamped, pruned, and cleaned up if Discord cannot post the controls, so stale local mappings do not permanently suppress a live prompt
- after an allow or answer response, Discord waits for the same session to settle and ignores the just-resolved pending request id so stale OpenCode polling cannot repost the same prompt
- Discord keeps the bot typing indicator active while it is waiting for Studio to produce a reply or a permission/question prompt
- Team thread sync keeps one watcher per Discord Team thread, starts that watcher immediately after `/team message`, also wakes it from Team runtime thread-update events, extends the watcher when the thread is touched again or new agent output is synced, refreshes the Team thread session list on every poll, emits typing while any agent session or Team agent runtime status is still busy or retrying, and waits for a stable-idle window before stopping
- Team thread input uses `/team message`; direct text messages in Team channels are not routed
- Discord Team channels sync visible text from all agent sessions in that Team thread
- Discord rejects additional Team chat if any agent session in that Team thread is running, retrying, or waiting on permission/question input
- Discord rejects additional standalone Agent chat while that Agent session is running, retrying, or waiting on permission/question input

Key rules:

- do not add a Discord-specific OpenCode execution path
- do not duplicate session ownership logic
- do not expose the bot token in route responses
- do not accept Discord events from an unselected server
- do not process Discord messages or interactions before authorization
- do not bypass Studio permission or question APIs from Discord
- keep Discord prompt length bounded before forwarding to Studio runtime
- keep Discord history backfill text-only and bounded
- always suppress accidental pings with `allowed_mentions: { parse: [] }`
- Team thread input must come through `/team message`
- serialize local Discord mapping writes inside the Studio server process; concurrent Discord messages, prompt replies, Team sync watchers, and workspace syncs must not overwrite each other's adapter metadata
- track Discord client/shard reconnect and error state in status responses without turning transient gateway reconnects into Studio runtime failures

## Checklist

- did the settings response redact the token
- are token and mapping files still private and not symlinks
- are Discord users checked against Manage Server or configured allowlists
- does Discord send through the same Studio chat services as the web UI
- do Discord permission and question responses reuse the same Studio approval services
- does Discord backfill avoid tools, reasoning, system-only content, and duplicate message ids
- does Team chat still use participant chat keys
- are stale Discord mappings handled as recoverable setup errors
- did any behavior change update this guide and the chat/runtime boundary guides

## Implementation Reference

- settings UI: `src/components/modals/SettingsDiscord.tsx`
- API routes: `server/routes/discord.ts`
- bot lifecycle and Discord event handling: `server/services/discord/discord-service.ts`
- config storage: `~/.apm-studio/discord-config.json`
- channel/role mappings: `~/.apm-studio/discord-mappings.json`

Runtime boundaries:

- Discord does not add a Discord-specific OpenCode execution path.
- Standalone Agent messages use `createStudioChatSession` and `sendStudioChatMessage`.
- Team participant messages use participant chat keys and the existing Team runtime services.
- Discord does not duplicate Studio session ownership logic.
