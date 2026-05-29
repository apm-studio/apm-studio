---
name: studio-assistant-studio-guide
description: "Explains APM Studio navigation, UI vocabulary, Packages behavior, Workspace vs thread terminology, and visible control names. Use for product-help questions. For direct UI mutation payloads, load studio-assistant-ui-operations-guide."
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio UI Guide

Use this skill for navigation, feature-discovery, and product-usage questions.

## Answer Rules
- Use exact visible UI labels when known.
- Start with the shortest correct answer.
- Prefer short navigation paths over broad descriptions.
- Distinguish `Workspace`, `working directory`, `draft`, `package`, `session`, and `thread`.
- Do not describe actions that are not visible in the current UI.
- If the user asks Studio to perform the UI action, load `studio-assistant-ui-operations-guide`.

## Core Vocabulary
- `Instruction`: always-on instruction layer for an Agent.
- `Skill`: optional reusable capability.
- `Agent`: an agent package on the canvas built from Instruction, Skills, model, and MCP.
- `Team`: a workflow that connects Agents as participants.
- `Workspace`: the current project folder plus saved Studio state and visible Studio objects.
- `Working directory`: the actual filesystem folder.
- `Draft`: local authoring state for an Instruction or Skill.
- `Package`: locally available APM package containing Agent, Instruction, Skill, or MCP primitives.
- `Session`: one Agent chat history.
- `Team thread`: one runtime execution/history of a Team.

## Main Layout
- Top toolbar: workspace controls, terminal menu, tracking, save selected package, theme, settings, assistant.
- Left sidebar: Workspace Explorer plus Packages drawer.
- Center canvas: Agents, Teams, markdown editors, terminals.
- Right panel: APM Assistant or Workspace Tracking.

## Common Navigation
- Assistant: toolbar `Assistant`.
- Settings: toolbar `Settings`.
- Packages: bottom of the left sidebar, `Packages`.
- Packages: `Packages -> Local -> Packages`.
- Models and MCPs: `Packages -> Local -> Models` and `Packages -> Local -> MCP`.
- Import search: `Import`.
- GitHub Skill import: `Import -> Import as Skill`.
- Skill target sync: save the Skill as an APM package, then use `Inject`.

## Packages Notes
- Local scope has `Packages`, `MCP`, and `Models`.
- Package source filters include `All`, `User`, and `Workspace`.
- Runtime `Models` lists available model providers.
- Runtime `MCPs` manages Studio MCP server definitions.
- An Agent uses an MCP only after the MCP card is attached to that Agent.
- Import search is discovery/import, not direct canvas mutation by itself.

## Team Window Notes
- A Team window is for running a Team thread, not primarily for editing topology.
- If no thread exists and the Team is runnable, the empty state shows `Ready to run` and `Create Thread`.
- After a thread exists, use `Board` for shared notes and participant tabs for participant chat.
- Use `Edit Team` to change participants, relations, description, rules, or readiness issues.

## Draft And Sharing Notes
- Instruction and Skill use markdown editor shells.
- Instruction editor actions include `Save Draft` and `Close`.
- Skill editor actions include `Save Draft`, `Open`, and `Close`.
- Skill and Agent reuse flows go through APM packages and GitHub source import, not direct registry primitive installs.
- Package import, target sync, and GitHub source import are lifecycle actions outside Assistant CRUD.

## More Detail
Read `references/navigation.md` only when exact UI behavior or labels matter.
