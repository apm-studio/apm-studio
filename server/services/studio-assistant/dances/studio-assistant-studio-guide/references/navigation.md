# Agent Roster Navigation Reference

## Top Toolbar
- `Agent Roster`: workspace initialization state.
- Branch label: current git branch when available.
- `Sign in` or user menu: Agent Roster registry login.
- Server status indicator.
- `Terminal`: `Show/Hide Pinned Terminal`, `Add Terminal to Canvas`.
- `Workspace Tracking`: opens the right-side tracking panel and closes Assistant.
- `Save or publish selected asset`.
- `Toggle Theme`.
- `Settings`.
- `Assistant`.

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

## Asset Library
- Opens from the bottom of the left sidebar.
- Top scopes: `Local` and `Registry`.
- `Local -> Installed Assets` has kind tabs for `Agent`, `Persona`, `Skill Pack`, `Team`.
- `Local -> Runtime` has `Models` and `MCPs`.
- `Registry` supports search, kind filters, and GitHub Skill Pack import.
- GitHub import accepts `owner/repo` or a GitHub URL and uses `Import as Skill Pack`.

## Asset Lifecycle
- `Save Local` applies to Persona, Agent, and Team registry flows.
- Skill Pack publishing uses `Save Draft`, optional `Open`, `Export`, external GitHub upload, then Registry import.
- If the user asks why Skill Pack cannot be published directly, explain the export/import path.

## Focus Mode
- Focus mode narrows the UI around a selected node.
- Asset Library is hidden while focus mode is active.
- If a user cannot find Asset Library, check whether focus mode is active.

## MCP Flow
- Define servers in `Asset Library -> Local -> Runtime -> MCPs`.
- Attach or drag the MCP card onto an Agent to enable it there.
- Agent Roster MCP library definitions are not the same as raw OpenCode project MCP config.
