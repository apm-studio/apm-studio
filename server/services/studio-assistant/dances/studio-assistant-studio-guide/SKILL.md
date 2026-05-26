---
name: studio-assistant-studio-guide
description: "Explains Agent Roster navigation, UI vocabulary, Asset Library behavior, Stage vs thread terminology, and visible control names. Use for product-help questions. For direct UI mutation payloads, load studio-assistant-ui-operations-guide."
compatibility: Designed for the Agent Roster built-in assistant projection.
---

# Agent Roster UI Guide

Use this skill for navigation, feature-discovery, and product-usage questions.

## Answer Rules
- Use exact visible UI labels when known.
- Start with the shortest correct answer.
- Prefer short navigation paths over broad descriptions.
- Distinguish `Stage`, `working directory`, `draft`, `installed asset`, `session`, and `thread`.
- Do not describe actions that are not visible in the current UI.
- If the user asks Studio to perform the UI action, load `studio-assistant-ui-operations-guide`.

## Core Vocabulary
- `Persona`: always-on instruction layer for an Agent.
- `Skill Pack`: optional reusable skill bundle.
- `Agent`: an agent package on the canvas built from Persona, Skill Packs, model, and MCP.
- `Team`: a workflow that connects Agents as participants.
- `Workspace`: current project folder plus saved Studio state.
- `Working directory`: the actual filesystem folder.
- `Stage`: the product surface containing current workspace objects; do not use it as a synonym for working directory.
- `Draft`: local authoring state for a Persona or Skill Pack.
- `Installed asset`: locally available Persona, Skill Pack, Agent, or Team.
- `Session`: one Agent chat history.
- `Team thread`: one runtime execution/history of a Team.

## Main Layout
- Top toolbar: workspace controls, terminal menu, tracking, save/publish selected asset, theme, settings, assistant.
- Left sidebar: Workspace Explorer plus Asset Library drawer.
- Center canvas: Agents, Teams, markdown editors, terminals.
- Right panel: Studio Assistant or Workspace Tracking.

## Common Navigation
- Assistant: toolbar `Assistant`.
- Settings: toolbar `Settings`.
- Asset Library: bottom of the left sidebar, `Asset Library`.
- Installed assets: `Asset Library -> Local -> Installed Assets`.
- Models and MCPs: `Asset Library -> Local -> Runtime`.
- Registry search: `Asset Library -> Registry`.
- GitHub Skill Pack import: `Asset Library -> Registry -> Import as Skill Pack`.
- Skill Pack export: open a Skill Pack draft editor, save it, then use `Export`.

## Asset Library Notes
- Local scope has `Installed Assets` and `Runtime`.
- Installed asset kind tabs include `Agent`, `Persona`, `Skill Pack`, and `Team`.
- Source filters include `All`, `Global`, `Workspace`, and `Draft`.
- Runtime `Models` lists available model providers.
- Runtime `MCPs` manages Studio MCP server definitions.
- An Agent uses an MCP only after the MCP card is attached to that Agent.
- Registry search is discovery/install, not direct canvas mutation by itself.

## Team Window Notes
- A Team window is for running a Team thread, not primarily for editing topology.
- If no thread exists and the Team is runnable, the empty state shows `Ready to run` and `Create Thread`.
- After a thread exists, use `Board` for shared notes and participant tabs for participant chat.
- Use `Edit Team` to change participants, relations, description, rules, or readiness issues.

## Draft And Publish Notes
- Persona and Skill Pack use markdown editor shells.
- Persona editor actions include `Save Draft` and `Close`.
- Skill Pack editor actions include `Save Draft`, `Open`, `Export`, and `Close`.
- Skill Pack uses export/import rather than the generic registry publish flow.
- `Save Local` and `Publish` are asset lifecycle actions outside Assistant CRUD.

## More Detail
Read `references/navigation.md` only when exact UI behavior or labels matter.
