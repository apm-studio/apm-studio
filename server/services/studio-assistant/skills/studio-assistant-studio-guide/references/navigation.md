# APM Studio Navigation Reference

## App Header
- `APM Studio`: workspace initialization state.
- Mode navigation for the primary Studio workflows.
- Branch label: current git branch when available.
- Server status indicator.
- `Toggle Theme`: switches the whole Studio UI between light and dark mode.
- `Settings`.

## Studio Agent Header Tools
- `Terminal`: `Show/Hide Pinned Terminal`, `Add Terminal to Canvas`.
- `Workspace Tracking`: opens the right-side tracking panel and closes Assistant.

## Assistant Panel
- Header shows model and status such as `Ready`, `Thinking`, `Running`, `Retrying`, or `Needs attention`.
- Header actions include refresh session and close panel.
- Idle composer shows send; running composer shows abort.
- Model picker sits below the input.

## Workspace Explorer
- Upper section: workspace list and workspace actions.
- Lower section: Agents pane and Teams pane.
- Agent rows support select/open, show/hide, `New session`, edit, save as draft, and delete.
- Team rows support select/open, show/hide, `New Thread`, edit, save as draft, and delete.
- Team child rows are saved Team threads.
- Agent child rows are saved Agent sessions.

## Team Window
- Header can show readiness, `Focus mode`, `Edit Team`, `Hide Team`, and a thread chip such as `#1`.
- Before a thread exists, use `Create Thread`.
- After a thread exists, use `Board` for shared notes and participant tabs for chat.
- If not runnable, use `Edit Team` and resolve readiness issues.

## Board Tab
- Shows shared runtime notes for a Team thread.
- Includes filters such as `All`, `Artifacts`, `Findings`, and `Tasks`.
- Includes freshness state, `Refresh`, and recent activity.

## Packages
- Opens from the bottom of the left sidebar.
- Top sections: `Packages`, `MCP`, and `Models`.
- `Packages` can be filtered by `All`, `User`, or `Workspace`.
- `Import` supports search and GitHub source import.
- GitHub import accepts `owner/repo` or a GitHub URL and creates APM packages.

## Package Lifecycle
- Studio package content lives under workspace/user APM package storage.
- Skill sharing uses APM package import, target sync, or Import GitHub source import.
- If the user asks why Skill cannot be sent directly to a target, explain that Studio syncs package primitives into target platforms instead of writing registry primitives.

## Focus Mode
- Focus mode narrows the UI around a selected node.
- Packages is hidden while focus mode is active.
- If a user cannot find Packages, check whether focus mode is active.

## MCP Flow
- Define servers in `Packages -> Local -> Runtime -> MCPs`.
- Attach or drag the MCP card onto an Agent to enable it there.
- APM Studio MCP library definitions are not the same as raw OpenCode project MCP config.
