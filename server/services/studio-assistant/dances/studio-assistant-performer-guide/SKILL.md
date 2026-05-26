---
name: studio-assistant-performer-guide
description: "Helps design or revise Agent Roster Agents with strong role focus, Persona/Skill Pack/model choices, and Team participant readiness. Use for Agent creation, Agent updates, role design, and participant-quality decisions. For exact payload fields, load studio-assistant-action-surface-guide."
compatibility: Designed for the Agent Roster built-in assistant projection.
---

# Agent Roster Agent Guide

Use this skill when the user wants an Agent created, revised, inspected, or attached as a useful Team participant.

## Load With
- Load `studio-assistant-action-surface-guide` before emitting `apply_studio_actions` payloads.
- Load `studio-assistant-tal-design-guide` when writing or revising Persona.
- Load `studio-assistant-workflow-guide` when the request is really about a team, pipeline, or Team.

## Agent Design Rules
- An Agent should reflect the user's requested role and working style, not a generic placeholder.
- Use role names directly when the user names them.
- Put the Agent's stable focus in `description`; this becomes participant focus inside Team runtime.
- If the request implies Persona, Skill Pack, model, variant, or MCP choices, include them only when they are known from the snapshot or clearly requested.
- Do not invent Persona URNs, Skill Pack URNs, MCP server names, provider ids, model ids, or model variants.
- If the user explicitly asks to omit Persona, Skill Pack, or model setup, honor that omission.
- If multiple materially different Persona/Skill Pack/model setups are plausible, ask one short clarifying question.

## Persona And Skill Pack Decisions
- Missing Persona alone should not block a clear Agent or workflow creation request.
- If the role intent is clear, prefer a compact inline `talDraft` in the same `createPerformer` action.
- Ask first only when Persona identity, tone, authority, or policy choices are important and unclear.
- If a new Agent needs a local Skill Pack, prefer inline `addDanceDrafts` or a same-call Skill Pack draft ref.
- If the user asks to find or apply an existing skill instead of creating one, load `find-skills`.

## Mutation Shape
- Prefer one dependency-complete `createPerformer` over `createPerformer` followed by `updatePerformer` when the dependencies are already known.
- Use same-call refs for newly created Persona/Skill Pack/Agent dependencies.
- Reuse existing Agents when they already match the requested role closely enough.
- For a direct team or workflow request, do not stop after creating loose Agents; create or update the Team too.

## Quality Bar
- `name` should identify the actual role.
- `description` should say what the Agent owns, how it reasons, or what handoff it produces.
- Persona should be durable and compact; keep one-off task instructions out of Persona.
- Skill Pack should hold optional procedures or reusable capability, not always-on identity.
- An Agent created for a Team should be distinct enough that nearby roles would behave differently.

## Good Agent Patterns
- Single expert: one clear role, compact Persona, model only when requested or already known.
- Researcher: gathers evidence, tracks uncertainty, hands off structured findings.
- Reviewer: checks risk, completeness, and actionability before approval.
- Operator: turns plans into executable steps, tracks status, and escalates blockers.

## Anti-Patterns
- Creating a role with only a generic name when the user gave real intent.
- Stuffing whole workflow choreography into Agent Persona instead of Team rules and relations.
- Adding broad MCP or Skill Pack dependencies without snapshot evidence.
- Asking for Persona details when the requested role is already clear enough to draft.
