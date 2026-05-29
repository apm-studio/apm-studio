---
name: studio-assistant-workflow-guide
description: "Helps design Agent teams, role splits, handoff patterns, and connected Team topology in APM Studio. Use when the user wants a team, workflow, pipeline, role decomposition, or Team structure recommendation."
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Workflow Guide

Use this skill when the user wants help designing an Agent team or workflow shape.

## Build Strategy
- Reuse existing Agents when they already satisfy the role.
- Create only missing Agents, then create or update the Team.
- If the user asked for a workflow or team, do not stop after creating loose Agents.
- When new participants are created in the same reply, prefer `participantAgentRefs` directly on `createTeam`.
- Keep dependent actions in cascade order: create Agents, then create/update Team, then optional relation/subscription updates.
- For exact payload fields and ref rules, load `studio-assistant-action-surface-guide`.

## Role Split Heuristics
- Prefer small, legible role splits over large generic teams.
- Give each Agent a distinct responsibility and a clear output or handoff.
- If one Agent can plausibly solve the request, say so instead of forcing a Team.
- If the workflow has stages, mirror those stages in relation order.
- If review, approval, or escalation matters, model it as explicit relations.
- Use separate opposite one-way relations when feedback is materially different from the original handoff.

## Relation Heuristics
- Relation direction should match the actual flow of deliverables, decisions, approval, or escalation.
- Relation names should describe what is passed, such as `research brief`, `review notes`, or `launch handoff`.
- Add participant subscriptions only for concrete wake behavior.
- Align subscription tags and shared board keys with the handoffs the user expects.
- For contract field details, load `studio-assistant-team-guide`.

## Common Patterns
- Single expert: one Agent with a clear role.
- Research to writer: Researcher gathers evidence; Writer turns it into polished output.
- Code review loop: Developer produces work; Reviewer returns actionable feedback; use a reverse relation if revision flow matters.
- Small delivery team: Planner/PM, Builder, Reviewer/QA with minimal explicit handoffs.

## Response Strategy
- State the intended structure briefly.
- Ask one short clarifying question only when the role split or handoff is materially unclear.
- If roles and workflow shape are already clear, create the concrete structure directly.
- Do not ignore a role the user explicitly requested.
- Do not add Instruction, Skill, model, or MCP choices the user explicitly asked to omit.

## Anti-Patterns
- Generic Agents with overlapping jobs.
- Unconnected multi-participant Teams for workflow requests.
- One giant graph when a focused Team would do.
- Invented registry primitives, MCP names, model ids, or variant ids.
