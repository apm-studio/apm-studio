# Discord Integration

APM Studio can connect a Discord bot so a Discord server can chat with saved APM Studio workspaces.
Discord is a runtime chat surface only: it can talk to standalone Agents and Team agents, but it does not create, edit, save, or publish APM Studio assets.

## What Gets Created

When a workspace is synced, APM Studio creates Discord objects that mirror the APM Studio sidebar, excluding Asset Library:

- one active workspace category, named after the workspace
- one archived category, named `archived`, for channels from previously active workspaces
- one shared `studio-control` channel at the top of the active workspace category
- one category per Agent, prefixed with `👤` and named after that Agent
- one category per Team, prefixed with `👥` and named after that Team
- thread channels under Agent and Team categories as threads are opened
- agent picker controls for Team chat

Discord shows one active APM Studio workspace at a time. When you switch workspaces, channels from the previous workspace move to `archived` instead of being deleted.

## Setup Overview

Setup has two sides:

- In Discord, create and invite a bot with the required permissions and intents.
- In APM Studio, save the bot token, select the Discord server, configure access, and sync a workspace.

The bot token stays server-side. APM Studio stores it locally under the Studio config directory, preferring `~/.apm-studio/discord-config.json` for new installs while preserving existing `~/.agent-apm` configs. API responses only report whether a token exists.

## Discord Setup

### 1. Create The Discord Application

1. Open the Discord Developer Portal.
2. Click `New Application`.
3. Give it a name, for example `APM Studio`.
4. Open the new application.

### 2. Create The Bot

1. In the application sidebar, open `Bot`.
2. Click `Add Bot` if the application does not already have one.
3. Copy or reset the bot token.
4. Keep this token private. Anyone with the token can run the bot.

Recommended bot settings:

- Disable `Public Bot` if this bot is only for your private APM Studio server.
- Disable `Requires OAuth2 Code Grant`. APM Studio uses a normal bot invite link, not a code grant flow.
- Enable `Message Content Intent`. Natural Discord chat needs this privileged intent so the bot can read message text.

### 3. Invite The Bot To Your Discord Server

The easiest invite path is from APM Studio after the token is saved, because APM Studio can generate the correct invite URL.

If you invite manually from the Discord Developer Portal:

1. Open `OAuth2` -> `URL Generator`.
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - `View Channels`
   - `Manage Channels`
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`
4. Open the generated URL.
5. Choose the target Discord server.
6. Approve the invite.

## APM Studio Setup

### 1. Open Discord Settings

1. Start APM Studio.
2. Open the workspace you want to expose to Discord.
3. Click the toolbar Settings button.
4. Open `Integrations` -> `Discord`.

You can also use the Discord status button in the toolbar when it is visible.

### 2. Save The Bot Token

1. Turn on `Enable Discord integration`.
2. Paste the bot token.
3. Save the settings.
4. Wait for APM Studio to report the bot status.

After saving, APM Studio starts the Discord bot from the local APM Studio server. The token field is write-only after save; APM Studio does not send the token back to the browser.

### 3. Invite The Bot From APM Studio

1. After APM Studio validates the token, use the `Invite bot` action.
2. Choose the Discord server.
3. Approve the invite.
4. Return to APM Studio.
5. Refresh the Discord status.

If Discord shows `Integration requires code grant`, go back to the Discord Developer Portal and disable `Requires OAuth2 Code Grant` for the application.

If Discord shows `Used disallowed intents`, enable `Message Content Intent` under the bot settings in the Discord Developer Portal.

### 4. Select The Discord Server In APM Studio

1. In `Settings` -> `Integrations` -> `Discord`, refresh status.
2. Select the Discord server from the server list.
3. If the server is not listed, paste the server ID manually.
4. Save settings again.

APM Studio supports one selected Discord server at a time.

### 5. Check Permissions

The settings panel shows a compact checklist. The bot needs:

- Manage Channels
- Send Messages
- Read Message History
- Use Slash Commands
- Message Content Intent

If permissions are missing, update the bot role or reinvite the bot with the generated invite URL.

### 6. Configure Access Control

By default, APM Studio only accepts Discord commands and messages from users with Discord `Manage Server`.
This is the safest default because Discord messages can trigger local APM Studio runtime execution.

Optional access overrides:

- add allowed role IDs for Discord roles that may use APM Studio without `Manage Server`
- add allowed user IDs for specific Discord users

Users without authorization may still see Discord channels if your server permissions allow it, but APM Studio rejects their control actions, slash commands, and chat messages.

### 7. Sync APM Studio To Discord

From `Settings` -> `Integrations` -> `Discord`:

1. Click `Sync current` to sync the open workspace.
2. Or click `Refresh workspace list` to refresh the Discord workspace selector.
3. Open Discord and find the active workspace category.
4. Open `studio-control`.

APM Studio saves the current workspace before syncing it, so Discord receives the latest agents and Teams.

## Discord Usage

### Use The APM Studio Control Channel

Open `studio-control` in the active workspace category.

From there you can:

- switch the active APM Studio workspace
- refresh/sync the workspace
- choose a standalone Agent
- choose a Team
- open existing threads
- create new threads

Asset Library is intentionally not available from Discord.

### Chat With A Standalone Agent

1. Open `studio-control`.
2. Select an Agent.
3. Choose an existing Agent thread or create a new one.
4. APM Studio opens a thread channel under the Agent category, for example `👤 Writer`.
5. If a mapped APM Studio session already has history, APM Studio backfills up to 20 recent text-only messages.
6. Type a normal Discord message in that thread channel.
7. While APM Studio is working, the bot shows a typing indicator.
8. After the first message, APM Studio refreshes the Discord channel name from the APM Studio thread title.

To create another standalone Agent thread from an Agent thread channel, run:

```text
/agent new
```

### Chat In A Team Thread

1. Open `studio-control`.
2. Select a Team.
3. Choose an existing Team thread or create a new one.
4. APM Studio opens a Team thread channel under the Team category, for example `👥 Product Review`.
5. If the mapped Team thread already has agent history, APM Studio backfills up to 20 recent visible text-only messages.
6. In the Team thread channel, run `/team message`.
7. Choose the agent from the command autocomplete and enter the message option.

Example:

```text
[APM User -> Reviewer]
Please review this draft and call out risks.
```

APM Studio routes the slash command message to the selected Team agent. Direct Discord messages typed into a Team thread are not routed; the bot will point you back to `/team message`.

Team thread channels show visible text messages from all agent sessions in that Team thread. When one agent responds, APM Studio syncs the agent history back into Discord so the channel reflects the full Team conversation.
Discord keeps the Team thread focused on human-visible conversation: user input is reposted by the bot in a normalized `[APM User -> Agent]` format, and synced APM Studio history shows agent output messages only. Internal runtime input, teammate wake prompts, tool output, reasoning, and system-only messages are hidden.

### Agent Selection

Use `/team message agent:<agent> message:<text>` inside the Team thread channel. Agent autocomplete is resolved from that channel's mapped Team only, so other workspaces and other Teams do not leak into the choices.

### Busy Sessions

Standalone Agent channels accept one active APM Studio turn at a time.
Team channels reject new messages if any agent session in that Team thread is running, retrying, or waiting on a permission/question response.

While APM Studio is working, Discord shows the bot typing indicator in the thread channel. In Team channels, APM Studio starts the per-thread watcher as soon as `/team message` is sent, also wakes it from Team runtime thread-update events, checks every agent session plus Team agent runtime status, extends that watcher whenever new output appears or the thread is touched again, and waits for a stable-idle window before it stops syncing agent output.

### Permissions And Questions

If APM Studio pauses for permission or input, the bot posts the prompt in the same Discord thread channel.

Permissions use buttons:

- `Deny`
- `Allow Once`
- `Allow Always`

Questions use Discord controls:

- single-option questions show a select menu
- if custom text is allowed, `Other` opens a text modal
- multi-question prompts and free-text answers use a modal
- canceling a question calls the same APM Studio reject flow as the web UI

After an answer or permission response, Discord waits for the same APM Studio session to settle and ignores the just-resolved pending request id so stale runtime polling cannot repost the same prompt.

## Slash Commands

The menu in `studio-control` is the main Discord UX. Slash commands are available for scoped maintenance and quick actions.

Workspace commands:

- `/workspace active` shows the currently active saved APM Studio workspace.
- `/workspace control` refreshes the `studio-control` panel for the current or active workspace.
- `/workspace sync` syncs the active workspace and refreshes the workspace selector.
- `/workspace switch workspace:<id-or-folder>` switches the active workspace by saved workspace ID, exact working directory, or exact folder name.

Agent commands:

- `/agent new` creates a fresh standalone Agent thread.
- This only works inside mapped Agent thread channels.

Team commands:

- `/team participants` shows the agents for the current Team thread.
- `/team message agent:<agent> message:<text>` sends a message to one agent in the current Team thread.
- `/team sync` backfills recent visible agent messages for the current Team thread.
- These only work inside mapped Team thread channels.

Every command must pass selected-server and actor authorization checks before APM Studio reads mappings or calls runtime services.

## Security Notes

- Discord configuration is stored locally under the APM Studio config directory.
- The bot token is written with private file permissions where supported by the OS.
- APM Studio refuses to write Discord config through symlinks.
- API responses redact the bot token and return only `hasToken`.
- APM Studio accepts events only from the selected Discord server.
- APM Studio checks Discord actor authorization before control actions, slash commands, or chat messages.
- Bot replies suppress accidental pings by default with `allowed_mentions: { parse: [] }`.
- Discord permission and question responses go through the same APM Studio runtime approval APIs as the web UI.
- Discord prompt length is bounded before messages reach the APM Studio runtime.
- Discord backfill is text-only and excludes tool output, reasoning, system-only content, diffs, and prior permission/question metadata.
- Treat Discord channel permissions as part of your security model. Only expose synced APM Studio channels to people who should be allowed to trigger local runtime work.

## Troubleshooting

### The bot does not come online

1. Check that Discord integration is enabled in APM Studio.
2. Re-enter the bot token and save.
3. Confirm the bot token was copied from the `Bot` page, not the application client secret.
4. Restart the APM Studio server if the local bot process was already running with old settings.

### The server is not selectable

1. Confirm the bot was invited to the Discord server.
2. Refresh Discord status in APM Studio.
3. Paste the server ID manually if it still does not appear.

### Sync does not create channels

1. Confirm the selected server is correct.
2. Check that the bot role has `Manage Channels`.
3. Check that the bot role is high enough in the role list.
4. Click `Sync current` again.

### I do not see participant autocomplete

1. Open the intended Team thread channel.
2. Type `/team message` and focus the `participant` option.
3. Run `/team agents` to confirm the participant list.
4. Click the Team thread again from `studio-control` if the channel mapping looks stale.

### The bot receives messages but says message content is missing

Enable `Message Content Intent` in the Discord Developer Portal under the bot settings, then restart or reconnect the APM Studio Discord integration.

### The invite says code grant is required

Disable `Requires OAuth2 Code Grant` in the Discord Developer Portal for the application, then use APM Studio's invite link again.
