# Discord Integration Guide

## Purpose

Discord is an external Studio chat client.

- it does not create, edit, save, or publish DOT assets
- it reuses Studio performer and Act chat runtime services
- Studio web owns configuration and sync controls

## Source Of Truth

- user-facing setup guide: `DISCORD_INTEGRATION.md`
- settings UI: `src/components/modals/SettingsDiscord.tsx`
- API routes: `server/routes/discord.ts`
- bot lifecycle and Discord event handling: `server/services/discord/discord-service.ts`
- config storage: `~/.dot-studio/discord-config.json`
- channel/role mappings: `~/.dot-studio/discord-mappings.json`

## Configuration

Discord is configured from the Studio web Settings modal.

- token is write-only from the client perspective
- API responses must return only `hasToken`
- one selected Discord server is supported in v1
- config and mapping files are written under `~/.dot-studio` with private file permissions
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
- one category per performer, prefixed with `👤` and named after that performer
- one category per Act, prefixed with `👥` and named after that Act
- lazily-created thread channels under those performer and Act categories as threads are opened
- `/act message` participant autocomplete for Act thread input, scoped to the mapped Act channel
- Discord-visible category and channel names avoid Studio-specific text prefixes such as `dot`, `t-`, and `a-`
- unnamed Discord-created thread channels use numbered `new-thread-N` names instead of Studio/OpenCode metadata ids
- sync removes active-workspace Discord thread channels and adapter mappings when the corresponding Studio standalone performer session or Act thread no longer exists

Asset Library is intentionally not projected to Discord.

## Slash Commands

Discord slash commands are grouped by Studio scope:

- `/workspace active` reports the active saved workspace.
- `/workspace control` refreshes the `studio-control` panel for the current or active workspace.
- `/workspace sync` syncs the active workspace and refreshes the workspace selector.
- `/workspace switch workspace:<id-or-folder>` switches to a saved workspace by exact workspace id, working directory, or folder name.
- `/performer new` creates a fresh standalone performer thread and is accepted only in mapped performer thread channels.
- `/act participants` lists participants for the current Act and is accepted only in mapped Act thread channels.
- `/act message participant:<participant> message:<text>` sends a message to one participant in the current Act thread. The participant option uses channel-scoped autocomplete from the mapped Act only.
- `/act sync` backfills recent visible participant messages and is accepted only in mapped Act thread channels.

The older `/studio menu`, `/studio sync`, and `/thread new` commands remain as compatibility aliases.
Commands must still pass the selected-server and actor authorization checks before they can read mappings or call Studio runtime services.

## Runtime Rules

Standalone performer messages use:

`createStudioChatSession` -> `sendStudioChatMessage`

Act participant modal submissions use:

`buildActParticipantChatKey(...)` -> `createStudioChatSession` -> `sendStudioChatMessage`

When a performer or Act thread channel is opened:

- Discord reuses the mapped session when one exists
- standalone performer categories list saved Studio performer sessions as channels
- Discord refreshes thread channel names from Studio thread titles after the first message
- recent text-only Studio history is backfilled into Discord by the bot, capped at 20 messages
- tool output, reasoning, system-only content, and prior permission/question metadata are not backfilled
- backfilled message ids are stored in `discord-mappings.json` to avoid duplicates
- Act thread history sync is assistant-output-only per participant; Discord user input is posted by the bot as normalized `[Studio User -> Participant]` text, while runtime-injected user prompts such as teammate wake/direct-message prompts stay hidden

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
- Act thread sync keeps one watcher per Discord Act thread, starts that watcher immediately after `/act message`, also wakes it from Act runtime thread-update events, extends the watcher when the thread is touched again or new participant output is synced, refreshes the Act thread session list on every poll, emits typing while any participant session or Act participant runtime status is still busy or retrying, and waits for a stable-idle window before stopping
- Act thread input uses `/act message`; direct text messages in Act channels are not routed
- Discord Act channels sync visible text from all participant sessions in that Act thread
- Discord rejects additional Act chat if any participant session in that Act thread is running, retrying, or waiting on permission/question input
- Discord rejects additional standalone performer chat while that performer session is running, retrying, or waiting on permission/question input

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
- Act thread input must come through `/act message`
- serialize local Discord mapping writes inside the Studio server process; concurrent Discord messages, prompt replies, Act sync watchers, and workspace syncs must not overwrite each other's adapter metadata
- track Discord client/shard reconnect and error state in status responses without turning transient gateway reconnects into Studio runtime failures

## Checklist

- did the settings response redact the token
- are token and mapping files still private and not symlinks
- are Discord users checked against Manage Server or configured allowlists
- does Discord send through the same Studio chat services as the web UI
- do Discord permission and question responses reuse the same Studio approval services
- does Discord backfill avoid tools, reasoning, system-only content, and duplicate message ids
- does Act chat still use participant chat keys
- are stale Discord mappings handled as recoverable setup errors
- did any behavior change update this guide and the chat/runtime boundary guides

## Implementation Reference

- settings UI: `src/components/modals/SettingsDiscord.tsx`
- API routes: `server/routes/discord.ts`
- bot lifecycle and Discord event handling: `server/services/discord/discord-service.ts`
- config storage: `~/.dot-studio/discord-config.json`
- channel/role mappings: `~/.dot-studio/discord-mappings.json`

Runtime boundaries:

- Discord does not add a Discord-specific OpenCode execution path.
- Standalone performer messages use `createStudioChatSession` and `sendStudioChatMessage`.
- Act participant messages use participant chat keys and the existing Act runtime services.
- Discord does not duplicate Studio session ownership logic.
