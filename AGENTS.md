# AGENTS.md

## Purpose

`studio` is the local editor for APM Studio.

APM Studio helps users manage AI coding assistant packages as agents, instructions, skills, teams, and workflows. The product model is:

1. Explore: discover community source references, presets, and compatibility metadata.
2. Design: import and edit local APM-backed packages in `.apm-studio/packages/*`.
3. Inject: materialize selected local packages into assistant-specific files through Agent Sync.

Think about the codebase in this order:

1. `src/` renders and edits Studio state in the browser.
2. `shared/` defines contracts shared by client and server.
3. `server/routes/` exposes HTTP boundaries.
4. `server/services/` owns package storage, registry import, runtime prep, projections, sync, and API behavior.
5. `.apm-studio/packages/<packageId>/apm.yml` is the canonical package source for new package content.
6. `.apm-studio/workspace.json` stores Studio-only workspace state such as canvas layout and local UI metadata.
7. `.opencode/` holds generated OpenCode-facing runtime artifacts.
8. OpenCode executes projected runtime artifacts outside the React app.

If you need the OpenCode source, use `/Users/junhoyoon/tmp/opencode-source/opencode`.

The sibling directory `/Users/junhoyoon/windsurfpjt/dance-of-tal/apm-registry` is the Cloudflare Worker registry project. Treat it as a separate project from this Studio repo.

## Top-Level Structure

- `src/`
  - Frontend application.
  - Main UI, canvas, local Packages drawer, Explore page, Agent Sync page, assistant chat, agent chat, team UI, Zustand store.
  - Treat this as the Studio interaction layer.
- `shared/`
  - Shared contracts and runtime-safe types.
  - Keep client/server protocol shapes here.
  - Do not put browser-only or server-only behavior here.
- `server/routes/`
  - HTTP boundary.
  - Thin route layer that validates/forwards requests into services.
- `server/services/`
  - Main backend behavior.
  - Studio workspace operations, APM package storage, Explore import, chat/session orchestration, draft handling, export, runtime prep.
- `server/services/apm-package/`
  - APM manifest, lockfile, YAML, package paths, and repository helpers.
  - New canonical package content should flow through this boundary.
- `server/services/explore-registry-service.ts`
  - Explore/catalog integration.
  - Reads registry source references and converts supported source formats into local APM packages.
- `server/services/agent-sync/`
  - Manual external assistant materialization boundary.
  - Codex is implemented first; future Claude/Gemini/etc. providers should fit the provider registry shape.
- `server/services/opencode-projection/`
  - Projection boundary from Studio packages into OpenCode-consumable runtime artifacts.
  - Studio-internal OpenCode runtime projection remains automatic.
- `server/services/act-runtime/`
  - Team runtime scheduling and collaboration internals.
  - The directory name is historical/internal; user-facing language should be Team or Workflow.
- `server/services/studio-assistant/`
  - Runtime-only APM Assistant projection and prompt/action layer.
- `.apm-studio/`
  - Studio package/workspace source of truth for new data.
  - Do not bypass APM package helpers when changing package content.
- `.opencode/`
  - Generated/projected OpenCode workspace data and manifests.
  - Useful for debugging projection output.
  - Do not treat this as the main source of truth unless the task is explicitly about projection artifacts.
- `doc/`
  - Detailed architectural and behavioral guides.
  - Read the relevant docs before making non-trivial runtime/session/assistant changes.
- `DESIGN.md`
  - Studio design system guide for humans and coding agents.
  - Read before adding or changing frontend UI.
  - Keep aligned with `src/tokens.css` and `src/primitives.css`.
- `public/`
  - Static assets served by the app.
- `client/`, `dist/`
  - Build outputs.
  - Prefer changing source files, not generated output.

## Explore, Design, Inject Boundary

The core package flow is:

`registry listing -> import adapter -> .apm-studio/packages/<packageId>/apm.yml -> Design edits -> Agent Sync -> assistant files`

- Explore is discovery/import, not the package source of truth after import.
- The Packages drawer is local-only: show installed/draft packages and runtime assets there, not registry Explore search.
- Registry listings should reference GitHub sources plus import recipes, trust/index metadata, and presets. They should not store user workspace state, private config, generated assistant files, or edited local package content.
- Design uses local APM packages as the canonical editable source.
- Inject always reads local package data. Do not sync directly from a registry listing into Codex/Claude/Gemini/OpenCode.
- External assistant export is manual through Agent Sync.
- Studio-internal OpenCode runtime projection remains automatic so local agent chat and team runtime can keep working.

## Frontend To Runtime Boundary

- Browser/UI work starts in `src/App.tsx`, feature modules under `src/features/`, reusable UI under `src/components/`, and state in `src/store/`.
- Frontend talks to the backend through `src/api-clients/` and shared API helpers.
- Backend entry is `server/app.ts` plus `server/routes/*`.
- Real behavior lives in `server/services/*`.
- APM persistence lives under `server/services/apm-package*`.
- Explore import lives in `server/services/explore-registry-service.ts`.
- Runtime preparation happens in backend services, especially `server/services/opencode-projection/*`, Agent Sync providers, and runtime/session services.
- Generated OpenCode runtime output belongs under `.opencode/`.

In short:

`src` -> `src/api-clients` -> `server/routes` -> `server/services` -> `.apm-studio` packages -> projection/sync -> assistant/runtime artifacts

## Naming Rules

- Product name: `APM Studio`.
- npm package and CLI: `apm-studio`.
- Assistant label: `APM Assistant`.
- Use `agent`, `instruction`, `skill`, `team`, `workflow`, `package`, `Explore`, `Design`, and `Inject` for user-facing copy.
- Do not introduce old product names or old role vocabulary in user-facing copy.
- Some internal files and types still contain older names such as `performer` or `act-runtime`. Treat those as implementation details unless you are doing a deliberate internal rename.
- GitHub metadata/docs should target `github.com/apm-studio/apm-studio`.
- New environment variables should use `APM_STUDIO_*`.

## Working Rules

- Keep the responsibility boundary clear:
  - UI/state shaping in `src/`.
  - Shared contracts in `shared/`.
  - HTTP validation and forwarding in `server/routes/`.
  - Runtime, package persistence, registry import, projection, and sync orchestration in `server/services/`.
- Do not bypass the normal path from frontend to backend to runtime.
- Do not write generated output in `client/`, `dist/`, `.opencode/`, or assistant export folders unless the task is specifically about generation output/debugging.
- Do not add compatibility or migration paths for old product storage unless explicitly requested.
- When a change affects sessions, assistant behavior, team runtime, projection policy, package storage, registry import, Agent Sync, or runtime reload behavior, check `doc/` first.

## Frontend Design System Rules

- Read `DESIGN.md` before adding or changing frontend UI; it describes Studio's product feel, layout language, primitive usage, and design-system workflow.
- `src/tokens.css` is the single source of truth for shared color, spacing, radius, shadow, and typography tokens.
- `src/primitives.css` owns reusable UI primitives such as buttons, inputs, pills, surface cards, and shared navigation treatments.
- If two UI elements have the same job, they should use the same primitive and the same visual treatment.
  - Navigation choices should reuse the same pill-style navigation language.
  - Card-like content containers should reuse the same surface card language.
  - Explore source asset cards should reuse the Packages sidebar `asset-card` classes instead of a separately styled card system.
  - Grouped settings/list rows should reuse the same border, spacing, and section rhythm.
- Do not introduce ad hoc token names inside feature CSS when an existing token or alias should be extended centrally in `src/tokens.css`.
- Do not restyle the same interaction pattern independently in each feature without a clear product reason.
- Prefer thin borders, compact spacing, soft surface contrast, and restrained accents so the UI stays clean and consistent with Studio.
- When adding new frontend UI, check `DESIGN.md`, `tokens.css`, and `primitives.css` first before inventing local classes.

## Documentation Rule

If you need detailed behavior, invariants, or change policy, read the documents in `doc/`.

Important starting points:

- `doc/STORAGE_BOUNDARY_GUIDE.md`
- `doc/CHAT_SESSION_RUNTIME_GUIDE.md`
- `doc/RUNTIME_CHANGE_BOUNDARY_GUIDE.md`
- `doc/STUDIO_ASSISTANT_GUIDE.md`
- `doc/CONFIG_BOUNDARY_GUIDE.md`
- `doc/ACT_CONTRACT_GUIDE.md`
- `doc/publish_rule.md`

Some doc filenames still reflect internal module names. Keep user-facing copy aligned with the APM Studio naming rules when you touch them.

## Update Rule

If code changes alter behavior, boundaries, contracts, runtime flow, package storage, registry import, sync behavior, or operator expectations, update the relevant document in `doc/` in the same change.

Do not leave code and docs out of sync.

## Design System Rule

- UI elements with the same role should use the same design language and primitives. Examples include list rows, panels, modals, buttons, and alert messages.
- Before styling a new component, check `DESIGN.md`, the tokens in `src/tokens.css` such as colors, borders, and spacing, along with shared classes in `src/primitives.css` such as `.alert`, `.surface-card`, and `.list-row`.
- Avoid hardcoding arbitrary colors or spacing units in local CSS files. Prefer shared tokens, and promote reusable patterns into `src/primitives.css`.
