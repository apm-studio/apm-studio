# Bundle Authoring Notes

- `SKILL.md` stays the source of truth for the skill body.
- `references/` is the best home for long examples, schemas, and decision tables.
- `scripts/` should be added only when deterministic execution matters more than free-form prompting.
- `agents/openai.yaml` is optional UI metadata, not runtime logic.
- Bundle filenames should be stable and meaningful. Do not append random strings, hashes, timestamps, or cache-busting suffixes to asset/reference/script files unless the user asks for versioned copies.
