---
name: find-skills
description: Finds, compares, and applies existing external Skills before creating a new one. Use when the user asks to find a Skill, search skills.sh, recommend an existing Skill, or install/apply a GitHub or skills.sh Skill.
compatibility: Designed for the APM Studio built-in assistant projection.
---

# Find Skills

Use this skill when the user likely wants an existing external skill, not a brand-new local Skill from scratch.

## Intent Split
- If the user wants a new Skill draft, an updated `SKILL.md`, or custom local Skill files, use `studio-assistant-skill-creator-guide` instead.
- If the user wants to search, compare, recommend, install, or apply an existing skill, use this skill.
- If the message mixes create and find/apply intent, ask one short clarifying question before mutating.

## Search Order
- Prefer installed local matches first.
- Then consider APM Studio registry matches.
- Then consider `skills.sh` or GitHub Skill candidates.
- Treat `skills.sh` hints as candidates, not guarantees.

## Recommendation Bar
- Prefer official or well-known sources when functionality is similar.
- Prefer higher-install candidates over obscure ones when they solve the same problem.
- Tell the user why a candidate fits in one short sentence.
- If a candidate has very low installs or an unfamiliar source, say so plainly.

## Security Rule
- Before recommending installation or application of a `skills.sh` or GitHub skill, warn briefly that third-party skills should be reviewed before use.
- Tell the user to check the source repository, maintainer reputation, install count, and actual `SKILL.md` contents.
- Do not auto-install an external skill when the exact candidate is still ambiguous.
- If the user explicitly names the exact skill and wants to apply it, you may proceed after a short security notice.

## Apply In Studio
- Recommend the exact GitHub or `skills.sh` source for the user to import through Import.
- If the source is still ambiguous, ask the user to pick the exact skill before changing the workspace.
