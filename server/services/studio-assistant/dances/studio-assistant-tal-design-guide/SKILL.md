---
name: studio-assistant-tal-design-guide
description: Helps the Agent Roster Assistant design strong Persona content for agents. Use when deciding what belongs in Persona, how concise it should be, how to express mental model, or how to propose a role-appropriate Persona before creating an Agent.
compatibility: Designed for the Agent Roster built-in assistant projection.
---

# Agent Roster Persona Design Guide

Use this skill when the task is not just "make a Persona draft exist", but "design a good Persona for this agent".

## What Persona Is For
- Persona is the always-on instruction layer for an Agent.
- Treat Persona like the core system prompt for the agent, not a dump of every possible instruction.
- Persona should define the agent's stable identity and operating posture.
- Persona should stay useful across many turns, not only one immediate task.

## What Belongs In Persona
- The role the agent plays.
- The agent's core responsibilities and ownership.
- The mental model or reasoning posture the agent should apply consistently.
- Durable collaboration rules, quality bar, and failure-avoidance rules.
- The agent's default tone or working style when that matters.

## What Does Not Belong In Persona
- One-off task instructions for the current turn.
- Large examples, long reference material, or bulky schemas.
- Highly specific workflow wiring that belongs to a Team.
- Reusable optional capability bundles that belong in Skill Packs.
- Ephemeral environment details that may go stale quickly.

## Compression Rule
- Persona content goes into the agent's core prompt path, so keep only high-value enduring guidance.
- Prefer a small number of strong rules over a long checklist.
- If a sentence would not help on most future turns, it probably should not live in Persona.
- Avoid repeating the same instruction in several phrasings.

## Design Heuristics
- Start from the agent's role, then define what good output looks like.
- Make the mental model explicit: how the agent should think, prioritize, and trade off.
- Include constraints that should apply broadly, not just in one workflow.
- Write for behavioral steering, not for documentation completeness.
- Keep the Persona distinct enough that nearby roles would behave differently.

## Persona vs Skill Pack vs Team
- Persona = always-on identity, posture, and durable rules.
- Skill Pack = optional reusable skill or procedure the agent can bring in when relevant.
- Team = multi-agent choreography, handoffs, and participant structure.
- If a rule applies only in one workflow or relation, prefer Team.
- If a capability is optional or specialized, prefer Skill Pack.
- If it should shape nearly every response from this agent, prefer Persona.

## Recommended Persona Shape
- One short role definition.
- One short mental-model section.
- A few durable operating rules.
- A few quality or safety rules.
- A short collaboration/output rule block when needed.

## Quality Bar
- A good Persona is specific, durable, and compact.
- A good Persona makes the agent feel intentionally designed, not generic.
- A good Persona includes persona only when it changes behavior in a useful way.
- A good Persona avoids fluffy backstory unless it materially improves decision-making.
- A good Persona should be short enough to scan quickly and strong enough to change outcomes.

## Assistant Behavior
- When proposing Persona for a new Agent, propose the smallest strong Persona that fits the requested role.
- If the user did not specify Persona and the role intent is clear, write a role-appropriate inline Persona draft without blocking the whole workflow. Ask first only when the Persona identity, tone, or policy choices are important and unclear.
- If several different mental models are plausible, ask one short clarifying question instead of blending them into a vague Persona.
- When revising a Persona, tighten and compress before expanding.
- Prefer removing low-signal text over adding more text.

## Examples Of Good Persona Content
- Role definition with real ownership.
- A reasoning stance such as skeptical reviewer, careful planner, or decisive operator.
- Durable collaboration rules such as cite uncertainty, escalate blockers, or prefer actionability.
- A quality bar such as correctness first, concise output, or risk-aware recommendations.

## Examples Of Weak Persona Content
- Long autobiographical persona text with little behavioral effect.
- Detailed workflow steps that belong in Skill Pack or Team.
- Giant prompt blocks mixing temporary task instructions with permanent identity.
- Repetitive style rules that do not materially change behavior.
