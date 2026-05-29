---
name: studio-assistant-skill-creator-guide
description: Helps the APM Studio Assistant create or extend Skills in an app-safe way. Use when the user wants a new Skill, a better SKILL.md, extra references or scripts, tighter trigger wording, or agents/openai.yaml metadata inside a Skill draft folder.
compatibility: Designed for the APM Studio built-in assistant projection.
---

# APM Studio Skill Creator

Use this skill when the user wants to build a Skill through APM Assistant.

## Studio-safe authoring model
- Use `createSkillDraft` or `updateSkillDraft` only for `SKILL.md`.
- Use `upsertSkillBundleFile` for sibling files such as `references/*.md`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.
- Use `deleteSkillBundleEntry` only for non-core bundle entries.
- Never target `SKILL.md` or `draft.json` with bundle file actions.
- Bundle file actions only work on saved Skill drafts.

## Recommended Skill Shape
- Keep `SKILL.md` concise and procedural.
- Put detailed examples or schemas in `references/`.
- Put deterministic helpers in `scripts/` only when they meaningfully reduce ambiguity or repetition.
- Create `agents/openai.yaml` only when the user wants the Skill to expose polished UI metadata.
- For non-trivial Studio mutations, keep dependent actions in one dependency-ordered `apply_studio_actions` call.
- Do not create clutter files such as `README.md`, `CHANGELOG.md`, or `QUICK_REFERENCE.md` unless the user explicitly asked for them.

## Skill-writing heuristics
- The frontmatter `name` should stay stable and slug-like.
- The frontmatter `description` should say what the skill helps with and when it should be used. That text strongly affects whether the skill triggers.
- Keep the body focused on workflow and decision rules, not general motivation.
- If the skill supports multiple variants, keep selection guidance in `SKILL.md` and move variant details into separate `references/` files.
- Prefer a few high-signal files over a wide scaffold.
- Read `references/bundle-authoring.md` when you need a quick reminder of what belongs in `SKILL.md` vs sibling files.

## Assistant behavior
- If the user wants a new Skill, prefer `createSkillDraft` first and give it a same-call `ref`.
- When you need extra bundle files in the same reply, reuse that `draftRef`.
- If the correct bundle path is unclear, ask a short clarifying question instead of guessing.
- Treat invalid mutation payloads as blockers. Fix ref ordering, draft-ref kind mismatches, and disconnected multi-participant `createTeam` payloads before calling the tool.
- If the user wants to improve an existing Skill, prefer updating the current draft and bundle files instead of creating a second overlapping Skill.
- When the user asks for an "enhanced" Skill, improve both triggerability and authoring quality: frontmatter, workflow instructions, and the right supporting files.

## Example

```json
{"version":1,"actions":[{"type":"createSkillDraft","ref":"research-skill","name":"Research Skill","content":"---\nname: research-skill\ndescription: Research workflow helpers.\n---\n\n# Research Skill\n\nUse this skill for focused research tasks."},{"type":"upsertSkillBundleFile","draftRef":"research-skill","path":"references/sources.md","content":"# Sources\n\nList trusted source types here."},{"type":"upsertSkillBundleFile","draftRef":"research-skill","path":"agents/openai.yaml","content":"display_name: Research Skill\nshort_description: Research workflow helpers\ndefault_prompt: Use this skill when you need focused research support."}]}
```
