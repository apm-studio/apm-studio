---
name: studio-assistant-instruction-design-guide
description: Helps the APM Studio Assistant design strong standalone Instruction content. Use when deciding what belongs in a project/file rule, how concise it should be, and how to express durable coding guidance.
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Instruction Design Guide

Use this skill when the task is not just "make an Instruction draft exist", but "design a good standalone Instruction primitive".

## What Instruction Is For
- Instruction is a standalone APM project/file rule primitive.
- Treat Instruction like durable coding guidance scoped to a project, path, language, or convention.
- Instruction should define rules, standards, and constraints that remain useful across many edits.
- Instruction is not an Agent attachment and should not define an Agent's identity.

## What Belongs In Instruction
- Project, repository, file, language, or framework rules.
- Durable quality bars, safety constraints, and failure-avoidance rules.
- Coding conventions, review standards, or workflow rules that apply repeatedly.
- Scope hints such as paths or file types when the Instruction is not global.

## What Does Not Belong In Instruction
- One-off task instructions for the current turn.
- Large examples, long reference material, or bulky schemas.
- Highly specific workflow wiring that belongs to a Team.
- Reusable optional capability bundles that belong in Skills.
- Ephemeral environment details that may go stale quickly.
- Agent identity, persona, or role design; that belongs in Agent Body.

## Compression Rule
- Instruction content goes into target/project rule paths, so keep only high-value enduring guidance.
- Prefer a small number of strong rules over a long checklist.
- If a sentence would not help on most future turns, it probably should not live in Instruction.
- Avoid repeating the same instruction in several phrasings.

## Design Heuristics
- Start from the scope and rule category, then define what compliant output looks like.
- Make priorities explicit: how the assistant should trade off correctness, style, safety, and maintainability.
- Include constraints that should apply broadly, not just in one workflow.
- Write for behavioral steering, not for documentation completeness.
- Keep the Instruction distinct enough that nearby project/file rules would behave differently.

## Instruction vs Agent vs Skill vs Team
- Instruction = standalone project/file rules and durable coding guidance.
- Agent = runnable/editable role package with Agent Body, Skills, MCP, and Studio-only model settings.
- Skill = optional reusable skill or procedure the agent can bring in when relevant.
- Team = multi-agent workflow, handoffs, and participant structure.
- If a rule applies only in one workflow or relation, prefer Team.
- If a capability is optional or specialized, prefer Skill.
- If it defines role behavior, prefer Agent Body.
- If it should shape project or file behavior across agents/targets, prefer Instruction.

## Recommended Instruction Shape
- One short scope statement.
- One short standards or rules section.
- A few durable operating rules.
- A few quality or safety rules.
- A short output or verification rule block when needed.

## Quality Bar
- A good Instruction is specific, durable, and compact.
- A good Instruction makes the project or file rule feel intentionally designed, not generic.
- A good Instruction includes instruction only when it changes behavior in a useful way.
- A good Instruction avoids fluffy backstory unless it materially improves decision-making.
- A good Instruction should be short enough to scan quickly and strong enough to change outcomes.

## Assistant Behavior
- Do not propose Instruction as a dependency for new Agent creation.
- If the user asks for an Agent role, use Agent Body guidance instead of Instruction.
- Ask first when the Instruction scope, policy, path, or convention choices are important and unclear.
- When revising an Instruction, tighten and compress before expanding.
- Prefer removing low-signal text over adding more text.

## Examples Of Good Instruction Content
- Role definition with real ownership.
- A coding convention such as test naming, import order, or error handling.
- A durable project rule such as preserve generated-output boundaries or avoid a deprecated API.
- A quality bar such as correctness first, maintainability, or risk-aware edits.

## Examples Of Weak Instruction Content
- Long autobiographical instruction text with little behavioral effect.
- Detailed workflow steps that belong in Skill or Team.
- Giant prompt blocks mixing temporary task instructions with permanent identity.
- Repetitive style rules that do not materially change behavior.
