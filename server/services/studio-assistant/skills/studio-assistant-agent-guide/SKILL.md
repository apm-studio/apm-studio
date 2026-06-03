---
name: studio-assistant-agent-guide
description: "Helps design or revise APM Studio Agents with strong role focus, Skill/MCP/model choices, and Team participant readiness. Use for Agent creation, Agent updates, role design, and participant-quality decisions. For exact payload fields, load studio-assistant-action-surface-guide."
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Agent Guide

Use this skill when the user wants an Agent created, revised, inspected, or attached as a useful Team participant.

## Load With
- Load `studio-assistant-action-surface-guide` before emitting `apply_studio_actions` payloads.
- Load `studio-assistant-workflow-guide` when the request is really about a team, pipeline, or Team.

## Agent Design Rules
- An Agent should reflect the user's requested role and working style, not a generic placeholder.
- Use role names directly when the user names them.
- Put the Agent's stable focus in `description`; this becomes participant focus inside Team runtime.
- If the request implies Skill, MCP, model, or variant choices, include them only when they are known from the snapshot or clearly requested.
- Do not invent Skill URNs, MCP server names, provider ids, model ids, or model variants.
- If the user explicitly asks to omit Skill, MCP, or model setup, honor that omission.
- If multiple materially different Skill/MCP/model setups are plausible, ask one short clarifying question.

## Skill And MCP Decisions
- Do not create or attach Instruction drafts as part of Agent creation. Instruction is a standalone APM primitive.
- If a new Agent needs a local Skill, prefer inline `addSkillDrafts` or a same-call Skill draft ref.
- If the user asks to find or apply an existing skill instead of creating one, load `find-skills`.

## Mutation Shape
- Prefer one dependency-complete `createAgent` over `createAgent` followed by `updateAgent` when the dependencies are already known.
- Use same-call refs for newly created Skill/Agent dependencies.
- Reuse existing Agents when they already match the requested role closely enough.
- For a direct team or workflow request, do not stop after creating loose Agents; create or update the Team too.

## Quality Bar
- `name` should identify the actual role.
- `description` should say what the Agent owns, how it reasons, or what handoff it produces.
- Agent instructions should carry the role's durable behavior. Keep one-off task instructions out of the Agent package.
- Skill should hold optional procedures or reusable capability, not always-on identity.
- An Agent created for a Team should be distinct enough that nearby roles would behave differently.

## Good Agent Patterns
- Single expert: one clear role, focused Agent instructions, model only when requested or already known.
- Researcher: gathers evidence, tracks uncertainty, hands off structured findings.
- Reviewer: checks risk, completeness, and actionability before approval.
- Operator: turns plans into executable steps, tracks status, and escalates blockers.

## Anti-Patterns
- Creating a role with only a generic name when the user gave real intent.
- Stuffing whole workflow structure into Agent instructions instead of Team rules and relations.
- Adding broad MCP or Skill dependencies without snapshot evidence.
- Asking for extra setup details when the requested role is already clear enough to draft.
