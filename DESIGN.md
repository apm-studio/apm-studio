# APM Studio Design System

## Purpose

This document describes the visual and interaction language for APM Studio, the local visual editor for managing APM-backed agent packages. It is the collaboration guide for humans and coding agents. The executable source of truth remains `src/tokens.css` and `src/primitives.css`.

Use this file before adding or changing frontend UI. It should help new work feel like part of Studio instead of a one-off screen.

## Product Feel

Studio should feel like a calm, precise, editor-grade workspace.

The interface should be:

- compact
- quiet
- operational
- scannable
- direct
- low-noise
- consistent across canvas, panels, modals, chat, and asset tools

Avoid:

- marketing-page layouts
- oversized hero sections
- decorative gradients
- ornamental backgrounds
- one-off card styles
- arbitrary local colors
- feature-specific button systems
- large empty spacing that weakens editor density

## Source Of Truth

Use these files in this order:

1. `src/tokens.css`
   - Color, spacing, radius, shadow, typography, status, and theme aliases.
   - Add reusable values here before repeating raw values across feature CSS.
2. `src/primitives.css`
   - Canonical reusable UI primitives: buttons, icon buttons, text inputs, selects, badges, tabs, cards, rows, modals, alerts, toggles, search inputs, and empty states.
   - Extend this file when a visual pattern is repeated by multiple features.
3. Feature CSS
   - Owns screen-specific layout, sizing, and component composition.
   - Should reuse tokens and primitives whenever the role already exists.

Do not treat `DESIGN.md` as a replacement for CSS tokens. It explains intent and rules; the implementation belongs in the CSS system.

## Theme Model

Studio supports light and dark themes through root tokens and `[data-theme="dark"]`.

Theme-aware UI should use semantic tokens such as:

- `--bg-canvas`
- `--bg-panel`
- `--bg-card`
- `--bg-hover`
- `--bg-selected`
- `--border-light`
- `--border-main`
- `--border-strong`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--accent`
- `--status-warning`
- `--status-danger`

Avoid hardcoded theme colors in feature CSS unless the value represents domain-specific content that cannot be expressed by an existing token. If a hardcoded value appears more than once, promote it into `src/tokens.css`.

## Layout Language

Studio is an editor, not a landing page. Default to dense, predictable layouts:

- left sidebar for navigation and assets
- canvas as the main working surface
- right-side panels for assistant, tracking, inspectors, and detail views
- bottom panel for terminal-like workflows
- modals only for focused, blocking tasks

Panels should align visually through shared border, background, and spacing rhythm. Large page sections, promotional hero blocks, and decorative full-page compositions do not belong in Studio UI.

## Surfaces

Use restrained contrast:

- canvas: `--bg-canvas`
- panels and modal bodies: `--bg-panel`
- repeated cards or raised blocks: `--bg-card` or `.surface-card`
- subtle hover: `--bg-hover`
- selected state: `--bg-selected`

Use thin borders by default:

- subtle separators: `--border-light`
- normal boundaries: `--border-main`
- active or emphasized boundaries: `--border-active` or `--accent`

Do not nest visual cards inside other visual cards. If content needs hierarchy inside a card, use section headers, rows, separators, or compact groups.

## Controls

Use the primitives before styling locally:

- `.icon-btn` for compact icon actions
- `.btn`, `.btn--primary`, `.btn--danger`, `.btn--sm` for command buttons
- `.text-btn` for low-emphasis text actions
- `.text-input`, `.input`, `.select` for form controls
- `.tab`, `.tab--lg`, `.tab__count` for pill-style choices
- `.toggle-switch` for binary settings
- `.badge`, `.badge--subtle` for metadata chips
- `.alert`, `.alert--muted`, `.alert--success`, `.alert--error`, `.alert--danger` for callouts
- `.surface-card` for repeated framed content
- `.list-row` for grouped settings and list rows
- `.modal-overlay`, `.modal-dialog`, and child modal classes for shared dialogs

If a feature already has a local class for one of these roles, keep the local class only for layout or feature-specific adjustments. The shared primitive should carry the base interaction and visual treatment.

Top-level modal overlays should render through `createPortal(..., document.body)`. Studio headers, canvas nodes, and editor frames can use `backdrop-filter`, `contain`, or other properties that create local containing blocks for `position: fixed`; portal rendering keeps modal sizing and z-index anchored to the viewport.

## Navigation

Navigation choices should use the same pill-style language as `.tab` unless a nearby established pattern clearly requires another treatment.

Use active state sparingly and clearly:

- active tab or mode: accent fill or selected background
- hover: soft background change
- disabled: lower opacity and no pointer events

Do not invent a new nav visual treatment for each panel.

Studio's primary workflow modes are Import, Manage, Run, and Inject. Keep them grouped in the app header so users can understand whether they are bringing in sources, editing local packages, running agents/teams, or injecting assistant artifacts.

The app header is the single top-level workspace header. Canvas controls, Run view controls, and page-specific actions should appear as dynamic header content instead of adding a second page or canvas header directly below it.

The app shell should stay stable across Import, Manage, Run, and Inject: keep the top header and left sidebar mounted, and swap only the main content area for the selected workflow. Do not build mode-specific sidebars inside feature pages when the global sidebar can provide the shared workspace/package context.

Keep mode-to-shell decisions centralized in `src/components/app-shell-policy.ts`. Shell components should receive an explicit sidebar/surface mode prop instead of independently reading `workspaceMode` and re-deriving the same policy.

The left sidebar content can still be mode-aware. Manage and Run may expose workspace assets plus the Packages drawer because users compose/edit with drag and drop there. Manage should show editable agents and teams without saved thread/session rows; Run is where thread/session history and run-time creation controls belong. Import and Inject should keep the sidebar quieter, showing only workspace context unless a specific workflow needs more.

Inject should use a three-column rhythm: the shared workspace sidebar, an APM Studio source column, and a Targets column. Targets should read the selected environment's definition files and show matched, new, and target-only items next to the Studio source so users choose the sync action from the comparison itself instead of parsing repeated summary text.

Import should behave like a compact source workbench: default to all package source groups, keep search prominent, and show GitHub-derived Agent, Skill, and MCP assets as separate scan-friendly sections that reuse the Packages sidebar `asset-card` classes.

The Packages drawer should stay local-only. It should follow APM structure: Packages first, Primitives (Agents, Instructions, Skills, MCP) second, and Models third. Agent package rows should be draggable to the canvas; Instructions, Skills, and MCP should be dragged from Primitives. Do not add a Local/Explore switch there; put registry search and community discovery surfaces on the Explore page.

## Lists And Rows

Rows should be compact, aligned, and easy to scan.

Use `.list-row` or match its rhythm for:

- settings rows
- grouped metadata
- selectable asset rows
- inspector relation rows
- provider and integration rows

Rows should generally use:

- horizontal alignment for title/action pairs
- compact gaps from the spacing scale
- thin separators
- muted secondary descriptions

## Status And Feedback

Use status tokens for warning, danger, and neutral states.

Preferred tokens:

- `--status-warning`
- `--status-warning-bg`
- `--status-danger`
- `--status-danger-bg`
- `--status-neutral`
- `--status-neutral-dim`

Use `.alert` variants for callout messages and `.badge` variants for compact metadata. Avoid creating local red/orange/green feedback styles when a shared status token can express the state.

## Typography

Studio typography is intentionally small and dense.

Use tokenized sizes:

- `--font-xs`
- `--font-sm`
- `--font-base`
- `--font-md`
- `--font-lg`

Use `--font-mono` for code, terminal, paths, and structured output. Avoid viewport-scaled type, negative letter spacing, and oversized headings inside panels or compact tools.

## Spacing And Radius

Use the spacing scale in `src/tokens.css`:

- `--space-1`
- `--space-2`
- `--space-3`
- `--space-4`
- `--space-5`
- `--space-6`

Use radii from:

- `--radius-sm`
- `--radius`
- `--radius-lg`

Pills may use `999px` where the shape itself is the pattern. Otherwise prefer the radius tokens.

## Icons

Use `lucide-react` icons for button icons when available. Icon buttons should use `.icon-btn` and a meaningful `title` or `aria-label`.

Avoid replacing familiar icon actions with text-only rounded buttons unless the command is ambiguous without text.

## Local CSS Rules

Feature CSS may define:

- component layout
- responsive behavior
- fixed-size canvas/editor geometry
- local composition classes
- domain-specific visualizations

Feature CSS should not redefine:

- button systems
- form control systems
- alert/callout systems
- card surface language
- global colors
- global spacing scale
- typography scale

When local CSS needs a new reusable pattern, promote it into `src/primitives.css`.

## Agent Workflow

Before adding frontend UI:

1. Read this file.
2. Inspect `src/tokens.css`.
3. Inspect `src/primitives.css`.
4. Inspect nearby feature CSS for local layout constraints.
5. Reuse an existing primitive when the role matches.
6. Add or extend tokens/primitives only when the pattern is reusable.

Before finishing frontend UI:

- Confirm new colors, spacing, radii, shadows, and typography use tokens where practical.
- Confirm repeated controls use shared primitives.
- Confirm light and dark themes are not accidentally broken by hardcoded colors.
- Confirm text fits in compact panels and buttons.
- Confirm cards are not nested inside cards.

## Current System Health

The design system is already active:

- `src/main.tsx` imports `src/index.css` and `src/primitives.css`.
- `src/index.css` imports `src/tokens.css`.
- Existing UI uses primitives such as `.btn`, `.icon-btn`, `.text-input`, `.select`, `.alert`, and `.toggle-switch` across modals, panels, toolbar actions, chat, asset tools, and Team/Agent editing.

Known areas to watch:

- Some older feature CSS still contains repeated raw `px`, `rgba(...)`, and hex values for local statuses, shadows, popovers, terminal views, and code-rendering surfaces.
- Some controls use local button-like classes because they predate the shared primitives.
- Continue migrating repeated local styles into `src/tokens.css` and `src/primitives.css` when touching those areas.
