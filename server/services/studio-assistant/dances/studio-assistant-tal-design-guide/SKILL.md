---
name: studio-assistant-tal-design-guide
description: Helps the APM Studio Assistant design strong Instruction content for agents. Use when deciding what belongs in Instruction, how concise it should be, how to express mental model, or how to propose a role-appropriate Instruction before creating an Agent.
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Instruction Design Guide

Use this skill when the task is not just "make an Instruction draft exist", but "design a good Instruction for this agent".

## What Instruction Is For
- Instruction is the always-on instruction layer for an Agent.
- Treat Instruction like the core system prompt for the agent, not a dump of every possible instruction.
- Instruction should define the agent's stable role, priorities, and operating posture.
- Instruction should stay useful across many turns, not only one immediate task.

## What Belongs In Instruction
- The role the agent plays.
- The agent's core responsibilities and ownership.
- The mental model or reasoning posture the agent should apply consistently.
- Durable collaboration rules, quality bar, and failure-avoidance rules.
- The agent's default tone or working style when that matters.

## What Does Not Belong In Instruction
- One-off task instructions for the current turn.
- Large examples, long reference material, or bulky schemas.
- Highly specific workflow wiring that belongs to a Team.
- Reusable optional capability bundles that belong in Skills.
- Ephemeral environment details that may go stale quickly.

## Compression Rule
- Instruction content goes into the agent's core prompt path, so keep only high-value enduring guidance.
- Prefer a small number of strong rules over a long checklist.
- If a sentence would not help on most future turns, it probably should not live in Instruction.
- Avoid repeating the same instruction in several phrasings.

## Design Heuristics
- Start from the agent's role, then define what good output looks like.
- Make the mental model explicit: how the agent should think, prioritize, and trade off.
- Include constraints that should apply broadly, not just in one workflow.
- Write for behavioral steering, not for documentation completeness.
- Keep the Instruction distinct enough that nearby roles would behave differently.

## Instruction vs Skill vs Team
- Instruction = always-on identity, posture, and durable rules.
- Skill = optional reusable skill or procedure the agent can bring in when relevant.
- Team = multi-agent choreography, handoffs, and participant structure.
- If a rule applies only in one workflow or relation, prefer Team.
- If a capability is optional or specialized, prefer Skill.
- If it should shape nearly every response from this agent, prefer Instruction.

## Recommended Instruction Shape
- One short role definition.
- One short mental-model section.
- A few durable operating rules.
- A few quality or safety rules.
- A short collaboration/output rule block when needed.

## Quality Bar
- A good Instruction is specific, durable, and compact.
- A good Instruction makes the agent feel intentionally designed, not generic.
- A good Instruction includes instruction only when it changes behavior in a useful way.
- A good Instruction avoids fluffy backstory unless it materially improves decision-making.
- A good Instruction should be short enough to scan quickly and strong enough to change outcomes.

## Assistant Behavior
- When proposing Instruction for a new Agent, propose the smallest strong Instruction that fits the requested role.
- If the user did not specify Instruction and the role intent is clear, write a role-appropriate inline Instruction draft without blocking the whole workflow. Ask first only when the Instruction scope, tone, or policy choices are important and unclear.
- If several different mental models are plausible, ask one short clarifying question instead of blending them into a vague Instruction.
- When revising an Instruction, tighten and compress before expanding.
- Prefer removing low-signal text over adding more text.

## Examples Of Good Instruction Content
- Role definition with real ownership.
- A reasoning stance such as skeptical reviewer, careful planner, or decisive operator.
- Durable collaboration rules such as cite uncertainty, escalate blockers, or prefer actionability.
- A quality bar such as correctness first, concise output, or risk-aware recommendations.

## Examples Of Weak Instruction Content
- Long autobiographical instruction text with little behavioral effect.
- Detailed workflow steps that belong in Skill or Team.
- Giant prompt blocks mixing temporary task instructions with permanent identity.
- Repetitive style rules that do not materially change behavior.
