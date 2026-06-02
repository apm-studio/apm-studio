# Studio Storage Boundary Guide

## Purpose

Studio storage is split into four active boundaries.

1. workspace
2. APM package
3. draft
4. runtime state

## 1. Workspace

- storage: `<workingDir>/.apm-studio/workspace.json`
- saved workspace index storage: `~/.apm-studio/workspaces/<workspaceId>/workspace.json`

May include:

- canvas Agent and Team state
- window and panel layout
- chat bindings
- workspace-only metadata

Rules:

- this is the source of truth for Studio UI and editor state
- it is not a canonical package manifest
- Studio only reads the current workspace document shape: `schemaVersion: 1`, `product: "APM Studio"`, and a `workspace` object
- old product workspace shapes are not migrated or adapted; unsupported documents are ignored so the current schema stays explicit
- saved workspace index files use the same current-document rule and wrap API-facing workspace data under `workspace`; route responses unwrap that document before returning data to the browser
- workspace Agent arrays are UI/cache state only; without a matching local package manifest, they are not hydrated into browser Agent state
- package-affecting Agent fields stored in the embedded workspace snapshot are only UI/cache state; Studio reloads Agent package fields from `packages/<packageId>/apm.yml`
- Agent primitive links in workspace snapshots use `skillRefs`; Instruction refs are standalone APM primitives and are not Agent attachments
- Studio-only fields such as internal participant bindings, canvas metadata, relation `id`, and hidden state may live here

## 2. APM Package

- workspace storage: `<workingDir>/packages/<packageId>/apm.yml`
- workspace lockfile: `<workingDir>/packages/<packageId>/apm.lock.yaml`
- workspace Microsoft APM source tree: `<workingDir>/packages/<packageId>/.apm/`
- user-scope storage: `~/.apm/packages/<packageId>/apm.yml`
- user-scope lockfile: `~/.apm/packages/<packageId>/apm.lock.yaml`
- user-scope Microsoft APM source tree: `~/.apm/packages/<packageId>/.apm/`

Rules:

- this is the canonical package boundary for agents, instructions, skills, MCP requirements, prompts, commands, hooks, and external target sync. Studio-only model selection is runtime/editor state and must not be exported into target artifacts.
- the workspace root `apm.yml` should reference local Studio-managed packages through `dependencies.apm: ["./packages/<packageId>"]`
- the user-scope root `~/.apm/apm.yml` should reference user packages through `dependencies.apm: ["./packages/<packageId>"]`
- `.apm-studio/packages/*` is removed storage. Do not read, migrate, or write package content there.
- saved workspace writes must materialize APM package files successfully before the workspace snapshot is considered saved
- saved workspace writes may update Agent package files, but must preserve already active imported primitive packages; deleting a canvas Agent is not the same operation as uninstalling its package
- use APM native fields when possible
- Studio-managed packages must keep managed APM source primitives under the package's own `.apm/agents`, `.apm/instructions`, `.apm/skills`, `.apm/prompts`, and `.apm/hooks` when those primitives exist, so the package root remains inspectable and compatible with APM-shaped source tooling. Commands are sourced from `.apm/prompts/*.prompt.md`; the target capability decides whether prompt files project as prompts or commands. MCP syncability is counted from `apm.yml` `dependencies.mcp` entries, not from generated target MCP files.
- store Studio-only canvas/team/workflow metadata under `x-apm`
- Studio draft references should not be emitted as `dependencies.apm` unless they are real installable Microsoft APM package references. If content is materialized into `.apm/`, keep Studio-only authoring metadata under `x-apm` only.
- preserve unknown APM fields during read/write
- `.apm/` files inside a package are source primitives. Studio may regenerate managed primitives from current Studio package metadata during package writes; imported standard APM or GitHub source trees should preserve and read the `.apm/` tree directly.
- Manage-side local package inspection may read supported `.apm/*` primitive source files for preview and change detection, but Studio must not edit primitive source content directly. Users edit primitive files in their local editor and then refresh Studio. Standard source primitives remain file-canonical, so refresh updates hashes/content previews without rewriting package files. Studio-managed Agent primary `.apm/agents/*.agent.md` external edits must sync the Agent body back into canonical manifest-backed Agent fields and then regenerate package files/lock so Studio state, runtime, and package metadata agree.
- `apm.lock.yaml` is derived package metadata. Studio reads it to report missing/current/stale/invalid lock state by comparing its recorded manifest hash with the current manifest hash, and may regenerate it from the current manifest. Do not expose the lockfile as user-editable package content, and do not rely on it for primitive file conflict detection because Studio's native lock currently records manifest integrity only.
- Studio Agent editing is a Studio surface over APM primitives: Agent Body in `.apm/agents/<name>.agent.md`, referenced Skills in `.apm/skills/*/SKILL.md`, and MCP requirements in `apm.yml` `dependencies.mcp`. The Agent description must flow into the generated `.agent.md` frontmatter `description`. Instruction is not an Agent component; reusable Instructions remain standalone `.apm/instructions/*.instructions.md` primitives that can be edited and synced independently. Model selection is stored for Studio runtime only and must not be emitted into external assistant projection artifacts.
- Dragging an installed Skill or MCP package onto an Agent attaches the package as an `apm-package/<scope>/<packageId>` ref. When the Agent package is saved, package refs must resolve back through the APM package service and materialize the referenced `.apm/skills` source or `dependencies.mcp` entry into the Agent package; do not treat these local package refs like unresolved external registry refs.
- Saving an Agent package must create only `.apm/agents/*.agent.md`, referenced `.apm/skills/*/SKILL.md`, and `apm.yml` `dependencies.mcp` entries for the composed Agent package. It must not create `.apm/instructions` and must not export model/modelVariant.
- target export rule: do not bundle the Python `microsoft/apm` CLI into Studio's npm package or require it during `npm install`. The public Studio installers in `public/install.sh` and `public/install.ps1` may install or update Studio, detect `apm`, delegate missing APM CLI installation to the official upstream Microsoft APM installer, and run `apm install` for a workspace that already has `apm.yml`. Studio treats APM as the package/spec shape and performs external target sync through a CLI-first pipeline: use `APM_STUDIO_APM_CLI` when configured, then `apm`, then `uvx --from git+https://github.com/microsoft/apm.git apm`, and fall back to Studio-native TypeScript projection only when no APM CLI runner is available and only for supported agent and skill sync units. If a selected APM CLI runner fails, report the CLI failure instead of replacing it with Studio fallback output. Instructions, prompts, commands, hooks, and MCP are CLI-only; if the CLI is unavailable or produces no project-scoped artifact, Studio reports a skipped result instead of inventing a fallback format.
- merged hook target sync must seed the existing shared target hook config into the temporary APM CLI workspace before installing the next package, so multiple hook packages merge into one target config instead of later packages replacing earlier ones. This applies to shared hook configs such as `.claude/settings.json`, `.claude/apm-hooks.json`, `.codex/hooks.json`, `.cursor/hooks.json`, `.gemini/settings.json`, and `.windsurf/hooks.json`. Temporary package roots should use the selected package id as their directory name so APM CLI hook script outputs are namespaced by package rather than a generic temp folder name.
- shared APM package/import contracts live in `shared/apm-contracts.ts`; target-sync contracts, sync-unit helpers, and target result shapes live in `shared/apm-sync-contracts.ts`. Export UI and server sync services should import sync shapes from the sync contract file instead of widening the package contract boundary.
- external target sync reads from this boundary
- Import searches APM Registry source-reference listings through the Studio backend proxy, previews selected listings through the GitHub import pipeline, and writes only explicit imports into this boundary as APM packages in the selected left-sidebar APM scope: the current workspace by default, or the APM user scope (`~/.apm`) when the user chooses User. Import search history is browser-only UI state limited to source text and import format; it must not store preview results, package content, workspace paths, or install state. The default registry endpoint is `https://registry.apm.studio`; until that Cloudflare custom domain is active, Studio falls back to the transition `workers.dev` registry endpoint. Development and private deployments may override the registry with `APM_STUDIO_REGISTRY_URL`.
- package APIs use the same `workspace` / `user` scope contract for list, read, write, delete, import, validation, package copy, and sync-adjacent operations; route handlers must resolve scope through `requestApmPackageWorkingDir` rather than reaching directly into workspace path helpers
- deleting a package through the APM package API removes the selected scope's package directory, removes the matching root `dependencies.apm` entry, and removes the package id from `.apm-studio/workspace.json` `activePackageIds` when present. It must not delete canvas Agent instances, generated external target files, or another scope's copy of the same package id.
- APM manifest services should keep responsibilities split: `manifest.ts` owns manifest validation, Agent package manifest building, and lockfile shaping; `manifest-agent-normalization.ts` owns workspace Agent snapshot normalization and `x-apm.agent` restoration; `manifest-hash.ts` owns stable manifest hashing for lockfiles.
- Import GitHub source catalogs should use a repo-specific conversion layer to expose source contents as package candidates before import; curated preset source adapters should stay on repositories that have been manually previewed and test-imported into a temporary workspace with importable agent, instruction, skill, hook, MCP, target-native, or APM package content. Tree discovery uses the GitHub tree/raw APIs and may fall back to GitHub codeload tarballs when the GitHub API is rate-limited, but it must not shallow clone repositories in the request path. Only explicit imports write local APM packages. Catalog-only discovery lives in `server/services/apm-package/github-source-catalog.ts`; candidate scanning orchestration lives in `server/services/apm-package/github-import-candidates.ts`; candidate ids/source metadata live in `github-import-candidate-ids.ts`; generic candidate manifest assembly lives in `github-import-candidate-builders.ts`; target-native reverse projection adapters live in `server/services/apm-package/target-import/`; package preview/import writes live in `server/services/apm-package/github-import.ts`.
- Successful imports that originated from an APM Registry listing may send a best-effort anonymous download event back to the registry. Event failures must not fail the import, and events must not include package content, workspace paths, user identifiers, IP addresses, or machine fingerprints.
- GitHub source imports accept `owner/repo`, `owner/repo#ref`, `owner/repo@ref`, `owner/repo/subpath`, GitHub `tree`/`blob` URLs, raw GitHub URLs, and GitHub SSH URLs. For `tree`/`blob`/raw URLs, preview/import must resolve the source ref and subpath before scanning so file URLs import only that selected package candidate when possible.
- GitHub source imports preview detected APM packages, managed `.apm/` primitives, `SKILL.md` folders, Claude agent Markdown, Codex TOML, category-organized Codex subagent TOML collections, instruction Markdown, MCP configs, and target-native artifacts before writing local packages. If upstream Microsoft APM adds an official adopt/reverse-import command, Studio should delegate to it first; until then, Studio's target-native adapters should derive behavior from APM target/integrator source and write canonical package source rather than generated target files. Target-native imports convert assistant target files into `.apm/*` source primitives: command/prompt Markdown becomes `.apm/prompts/*.prompt.md`, instruction/rule Markdown becomes `.apm/instructions/*.instructions.md`, hook JSON becomes top-level `.apm/hooks/*.json`, and referenced hook scripts are copied under `.apm/hooks/scripts/<target>/` with package-local `./scripts/<target>/...` or plugin-root command references so CLI-first target sync can rewrite them. Studio may keep `x-apm.kind: hook` or `x-apm.kind: command`, but imported manifests must use Microsoft APM-valid package `type` values such as `hybrid` or `prompts`, not Studio-only primitive words that upstream APM rejects. Full APM package imports must preserve existing `.apm/prompts/*.prompt.md` and `.apm/hooks/*.json`. APM command sync uses prompt files for command-capable targets. Standalone MCP config imports must preserve self-defined server details such as command, args, env, URL, headers, and transport in `dependencies.mcp` so CLI-first target sync can export the same server configuration. The original repo/ref/path should stay in the manifest source metadata and `x-apm.agent.derivedFrom` when applicable.
- Star counts on import catalog sources are dynamic discovery metadata. They may be cached briefly and used for sorting, but they are not canonical package data.
- inline agent bodies imported from Codex TOML or other assistant-native formats stay in APM native `agents` fields and are mirrored into `x-apm.agent.agentBody` for projection. Agent imports do not create reusable Instruction refs.

## 3. Draft

- storage: `<workingDir>/.apm-studio/drafts/`

Examples:

- Instruction / Agent / Team: `.apm-studio/drafts/<kind>/<id>.json`
- Skill: `.apm-studio/drafts/skill/<id>/draft.json` plus bundle files

Rules:

- draft is the authoring-save boundary
- draft is not the canonical package boundary
- unsaved markdown draft is memory-only
- only saved drafts enter server-backed draft workflows
- draft CRUD, delete preview, and Skill bundle file API contracts live in `shared/draft-contracts.ts`; route handlers and browser clients should import those shared shapes rather than redefining ad hoc `{ ok, path }` responses locally
- draft content is kind-specific at the HTTP and storage boundary: Instruction and Skill content is markdown text, Agent content is `AgentDraftContent`, and Team content is `TeamDraftContent`
- draft create/update routes reject content that does not match the selected kind and normalize saved content to the current Studio draft schema; no old draft content aliases or compatibility loaders are supported

## Package Primitive Boundary

Rules:

- new canonical agent, instruction, skill, and MCP content should be normalized into an APM package under `packages/*` for workspace scope or `~/.apm/packages/*` for user scope
- Studio does not keep a second local registry for package primitives
- new UI, import, package, injection, and authoring work must go through package reads/writes/deletes
- obsolete primitive storage or route callers should be deleted instead of kept behind alternate old-shape paths
- do not add compatibility loaders, route aliases, or migration code for removed Studio storage models
- when the Studio source checkout itself is used as a dev workspace, generated `packages/`, `.apm/`, `.apm-studio/`, root `apm.yml`, and root `apm.lock.yaml` remain local artifacts and must stay ignored by git

## 4. Runtime State

- storage: `~/.apm-studio/workspaces/<workspaceId>/team-runtime/...`

Examples:

- mailbox
- shared board
- wake conditions
- participant sessions and statuses
- event log

Rules:

- this is execution-only state
- do not serialize it back into draft or canonical package boundaries

## Core Rule

Do not store one boundary's shape directly in another boundary.

- workspace -> APM package is valid only through the APM package service
- runtime -> draft or package direct save is invalid
- draft -> package materialization requires package normalization

## HTTP Boundary

- `server/routes/apm/packages.ts` owns APM package listing, reading, writing, deleting, copying across package scopes, and manifest validation routes.
- `server/routes/apm/import.ts` owns conversion/import routes that write GitHub or raw source material into local APM packages.
- `workspace` / `user` scope parsing is defined in `shared/apm-contracts.ts` and applied at the route boundary before services receive a concrete working directory.
- APM package, import, validation, tooling, target-inspection, and sync HTTP contracts live in `shared/apm-contracts.ts`; route handlers and browser clients should use those current shapes instead of inline `{ ok, ... }` response objects.
- Shared error payloads live in `shared/api-contracts.ts`; route helpers should return `ApiErrorResponse` instead of ad hoc `{ error }` object literals.
- Services that hand failure results to route helpers should type those failures as `ApiServiceFailure` and create them through `server/lib/api-service-failure.ts` so route boundaries do not depend on inferred inline error unions. Generic service failure statuses use `ApiErrorStatus`; domain-specific responses such as Team runtime errors should extend `ApiErrorResponse` and expose a narrowed shared status union.
- Generic service failures should pass through `jsonServiceFailure`, which keeps public `ApiErrorResponse` metadata and strips internal `ok`/`status` control fields from the response body.
- Team runtime routes should return `TeamRuntimeErrorResponse` through `server/routes/team-runtime/route-errors.ts`; do not cast `result.status` in each route handler.
- External adapter errors, including OpenCode errors, must normalize to `ApiErrorResponse` and `ApiErrorStatus` before leaving the route boundary; do not expose adapter-specific status values or duplicate error code/action vocabularies.
- `server/routes/apm/sync.ts` owns external assistant target inspection and manual package sync routes. The route layer stays thin; `server/services/apm-package/target-sync.ts` composes target summaries and whole-run orchestration only. Request normalization, package/target/unit capability checks, and runnable or skipped job planning belong in `target-sync-plan.ts`; CLI-first execution plus Studio fallback handling belongs in `target-sync-execution.ts`; Studio fallback policy/result assembly belongs in `studio-fallback-sync.ts`; fallback package snapshot loading belongs in `studio-fallback-package.ts`; fallback artifact rendering/writing belongs in `studio-fallback-artifacts.ts`; temporary package assembly belongs in `sync-temp-package.ts`; and CLI artifact adoption belongs in `sync-cli-artifacts.ts`.
- Target detection status should come from upstream APM when possible. `GET /api/apm/targets` may keep Studio's local target metadata for labels, supported sync units, and artifact adoption roots, but active/inactive/source/deploy-dir target detection should be annotated from `apm targets --json --all` through the selected APM CLI runner rather than reconstructed in Studio.
- Workspace/package integrity status should come from upstream APM when possible. `GET /api/apm/audit` delegates to `apm audit --ci --no-policy -f json` and treats the result as read-only status for lockfile consistency, deployed-file drift, and content integrity. Studio should display these findings instead of adding parallel drift/security rule implementations.
- CLI-produced and Studio-fallback target artifacts must share the same ownership manifest at `.apm-studio/projections/apm-sync.json` so Export target inspection, overwrite protection, and current-item summaries use one source of truth.
- The ownership manifest is also the only supported source for pairing Studio packages with target definition files; unmanaged target files should be shown as target-only files, not matched through name/path compatibility heuristics.
- `server/routes/drafts/skill-bundle.ts` owns Skill draft bundle file operations and opening the bundle folder; browser code must not construct `.apm-studio/drafts/...` paths directly.
- Draft persistence lives under `server/services/drafts/`: `service.ts` owns kind-level draft CRUD orchestration, `draft-normalizers.ts` owns kind-specific draft content/file validation, `draft-dependency-planner.ts` owns delete-preview/cascade dependency graph planning, and `skill-bundle-service.ts` owns directory-backed Skill bundle files.
- Draft HTTP contracts live in `shared/draft-contracts.ts`; server services, route responses, tests, and browser clients should use those current shapes directly.
- Draft service operations that back HTTP routes should return shared draft response contracts for successful results and `null`/typed service failures for not-found cases, rather than local `{ ok: boolean }` unions.
- `server/routes/apm/index.ts` should stay a thin route composer for those APM package boundaries.
- Shared Studio store path helpers live in `server/lib/apm-studio-paths.ts`; canonical APM package code should not invent path helpers just to resolve `.apm-studio`, workspace package, or user-scope APM paths.
- Saved workspace HTTP/document contracts live in `shared/workspace-contracts.ts`; that file owns the current Agent, Team, Markdown editor, canvas terminal, and saved document snapshot shapes. Server services and browser clients should import those shared shapes rather than weakening workspace state to generic JSON arrays or redefining workspace summaries locally.
- Saved workspace service orchestration stays in `server/services/workspace/service.ts`; current-document file IO, id/path validation, and list summaries belong in `server/services/workspace/document-store.ts`; APM snapshot merging and Agent snapshot normalization belong in `server/services/workspace/snapshot-merge.ts`; delete-time OpenCode/session/runtime cleanup belongs in `server/services/workspace/delete-cleanup.ts`.
- Saved workspace list responses use `SavedWorkspaceListResponse` (`{ workspaces: [...] }`) at the HTTP boundary; browser clients may unwrap it for local convenience, but routes should not return bare arrays.
- Browser API clients should depend on `shared/*` contracts and keep UI-only hydration, such as adding local draft save state, at the client boundary instead of importing broad app store types.
- Import, package edit, and sync behavior must go through the APM package routes above.

## Related Docs

- `doc/TEAM_CONTRACT_GUIDE.md`
- `doc/CONFIG_BOUNDARY_GUIDE.md`
- `doc/RUNTIME_CHANGE_BOUNDARY_GUIDE.md`
