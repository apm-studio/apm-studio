---
name: studio-assistant-agent-guide
description: "Helps design or revise APM Studio Agents with strong role focus, Instruction/Skill/model choices, and Team participant readiness. Use for Agent creation, Agent updates, role design, and participant-quality decisions. For exact payload fields, load studio-assistant-action-surface-guide."
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Agent Guide

Use this skill when the user wants an Agent created, revised, inspected, or attached as a useful Team participant.

## Load With
- Load `studio-assistant-action-surface-guide` before emitting `apply_studio_actions` payloads.
- Load `studio-assistant-instruction-design-guide` when writing or revising Instruction.
- Load `studio-assistant-workflow-guide` when the request is really about a team, pipeline, or Team.

## Agent Design Rules
- An Agent should reflect the user's requested role and working style, not a generic placeholder.
- Use role names directly when the user names them.
- Put the Agent's stable focus in `description`; this becomes participant focus inside Team runtime.
- If the request implies Instruction, Skill, model, variant, or MCP choices, include them only when they are known from the snapshot or clearly requested.
- Do not invent Instruction URNs, Skill URNs, MCP server names, provider ids, model ids, or model variants.
- If the user explicitly asks to omit Instruction, Skill, or model setup, honor that omission.
- If multiple materially different Instruction/Skill/model setups are plausible, ask one short clarifying question.

## Instruction And Skill Decisions
- Missing Instruction alone should not block a clear Agent or workflow creation request.
- If the role intent is clear, prefer a compact inline `instructionDraft` in the same `createAgent` action.
- Ask first only when Instruction scope, tone, authority, or policy choices are important and unclear.
- If a new Agent needs a local Skill, prefer inline `addSkillDrafts` or a same-call Skill draft ref.
- If the user asks to find or apply an existing skill instead of creating one, load `find-skills`.

## Mutation Shape
- Prefer one dependency-complete `createAgent` over `createAgent` followed by `updateAgent` when the dependencies are already known.
- Use same-call refs for newly created Instruction/Skill/Agent dependencies.
- Reuse existing Agents when they already match the requested role closely enough.
- For a direct team or workflow request, do not stop after creating loose Agents; create or update the Team too.

## Quality Bar
- `name` should identify the actual role.
- `description` should say what the Agent owns, how it reasons, or what handoff it produces.
- Instruction should be durable and compact; keep one-off task instructions out of Instruction.
- Skill should hold optional procedures or reusable capability, not always-on identity.
- An Agent created for a Team should be distinct enough that nearby roles would behave differently.

## Good Agent Patterns
- Single expert: one clear role, compact Instruction, model only when requested or already known.
- Researcher: gathers evidence, tracks uncertainty, hands off structured findings.
- Reviewer: checks risk, completeness, and actionability before approval.
- Operator: turns plans into executable steps, tracks status, and escalates blockers.

## Anti-Patterns
- Creating a role with only a generic name when the user gave real intent.
- Stuffing whole workflow structure into Agent Instruction instead of Team rules and relations.
- Adding broad MCP or Skill dependencies without snapshot evidence.
- Asking for Instruction details when the requested role is already clear enough to draft.
