# Deployment Guide

## Purpose

This guide documents how APM Studio is packaged, published, installed, and verified.

Use it when changing:

- npm package metadata or lifecycle scripts
- `public/install.sh` or `public/install.ps1`
- production server/client serving
- CLI startup, update, or version behavior
- release, install, or post-publish verification steps

## Release Artifacts

APM Studio has one public runtime artifact: the npm package `apm-studio`.

The published package includes only:

- `dist/`
- `client/`
- `README.md`
- `LICENSE`

Rules:

- `dist/` and `client/` are generated release output and must not be committed.
- `client/` is built by Vite and includes files copied from `public/`.
- `public/install.sh` and `public/install.ps1` are the source installer scripts served from GitHub raw URLs and copied into `client/` for the npm package.
- production mode serves the built `client/` directory from the Hono server.
- production static serving must expose the full `client/` output before the SPA fallback. Serving only `/assets/*` is not enough because favicons, manifest files, installer scripts, and APM Studio logo assets live at the client root.

## Package Lifecycle

`package.json` owns the release gates.

- `npm run build:all`
  - removes generated `dist/` and `client/`
  - builds the Vite client into `client/`
  - compiles server/CLI/shared TypeScript into `dist/`
  - copies runtime prompt/skill assets into `dist/`
  - makes `dist/cli.js` executable
- `npm run pack:check`
  - runs `npm pack --dry-run`
  - triggers `prepack`
  - confirms the package file list without publishing
- `prepack`
  - runs `npm run build:all`
  - guarantees npm publish uses fresh generated artifacts
- `prepublishOnly`
  - runs `npm run type-check && npm test`
  - blocks real `npm publish` when type-checks or tests fail

Do not bypass these lifecycle hooks for a public release.

## Version Rules

- Every public fix needs a new npm version.
- `package.json` and `package-lock.json` must have the same root version.
- npm will not accept publishing the same version twice.
- The public installers default to `apm-studio@latest`, so users only receive a fix after npm `latest` points at the new version.
- Keep the release commit, Git tag, and npm version aligned.
- Suggested tag format: `vX.Y.Z`.

Before publishing, check:

```bash
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
node -p "require('./package-lock.json').packages[''].version"
```

After publishing, check:

```bash
npm view apm-studio version dist-tags.latest --json
```

Both values should match the version you just released.

## Installer Flow

The one-click installers are in `public/`.

Unix:

```bash
curl -fsSL https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.sh | sh
```

Windows:

```powershell
irm https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.ps1 | iex
```

Installer behavior:

1. verify Node.js and npm are available
2. require Node.js `>=20.19.0`
3. install or update `${APM_STUDIO_NPM_PACKAGE:-apm-studio}@${APM_STUDIO_VERSION:-latest}`
4. refresh `PATH` and resolve the concrete `apm-studio` command
5. install the upstream Microsoft APM CLI when missing, unless disabled
6. run `apm install` when the selected workspace has `apm.yml`, unless disabled
7. either print the exact start command or start Studio immediately

Installer flags and environment:

- Unix `--studio-version VERSION` / env `APM_STUDIO_VERSION`
- Unix `--dir PATH` / env `APM_STUDIO_WORK_DIR`
- Unix `--no-apm` / env `APM_STUDIO_INSTALL_APM=0`
- Unix `--no-apm-install` / env `APM_STUDIO_RUN_APM_INSTALL=0`
- Unix `--start` / env `APM_STUDIO_START=1`
- Windows `-StudioVersion VERSION` / env `APM_STUDIO_VERSION`
- Windows `-Dir PATH`
- Windows `-NoApm`
- Windows `-NoApmInstall`
- Windows `-Start`

`--no-apm` and `-NoApm` also skip workspace `apm install` because the APM CLI may not exist.

## Production CLI Flow

The published `apm-studio` command:

1. reads package metadata from the installed package root
2. optionally checks npm for a newer version and prompts interactive users to update
3. resolves and validates the workspace path
4. resolves an available Studio port, avoiding the managed OpenCode sidecar port
5. sets:
   - `APM_STUDIO_PRODUCTION=1`
   - `APM_STUDIO_PROJECT_DIR`
   - `PORT`
6. initializes Studio workspace metadata
7. imports the Hono server
8. exposes `/api/health` before waiting on managed sidecar readiness
9. prints the Studio URL
10. opens the browser unless `--no-open` was passed

Production mode uses the published CLI port set documented in `doc/CONFIG_BOUNDARY_GUIDE.md`.

## Release Procedure

1. Inspect the worktree.

```bash
git status --short
```

2. Bump the npm version in both package files.

```bash
npm version X.Y.Z --no-git-tag-version
```

3. Run release checks.

```bash
npm run type-check
npm test
npm run pack:check
```

4. Publish.

```bash
npm publish
```

If npm requires a one-time password, rerun with:

```bash
npm publish --otp=123456
```

An OTP failure means nothing was published.

5. Verify npm `latest`.

```bash
npm view apm-studio version dist-tags.latest --json
```

6. Commit, tag, and push.

```bash
git add package.json package-lock.json README.md doc/ cli.ts server/ shared/ src/ public/ scripts/
git commit -m "Release X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

7. Verify GitHub and npm agree.

```bash
git ls-remote origin main refs/tags/vX.Y.Z
curl -fsSL https://raw.githubusercontent.com/apm-studio/apm-studio/main/package.json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).version))"
```

## Deployed Install Smoke Test

Use a temporary npm prefix so the test proves the published package works without depending on the developer's global install.

```bash
tmpdir="$(mktemp -d)"
prefix="$tmpdir/npm-global"
workspace="$tmpdir/workspace"
mkdir -p "$prefix" "$workspace"

APM_STUDIO_INSTALL_APM=0 \
APM_STUDIO_RUN_APM_INSTALL=0 \
npm_config_prefix="$prefix" \
sh -c "curl -fsSL https://raw.githubusercontent.com/apm-studio/apm-studio/main/public/install.sh | sh -s -- --dir '$workspace' --no-apm --no-apm-install --no-start"

"$prefix/bin/apm-studio" --version
"$prefix/bin/apm-studio" "$workspace" --no-open --port 43115
```

In another terminal, verify:

```bash
curl -sS -o /tmp/apm-studio-root -w '%{http_code} %{content_type}\n' http://127.0.0.1:43115/
curl -sS -o /tmp/apm-studio-health -w '%{http_code} %{content_type}\n' http://127.0.0.1:43115/api/health
curl -sS -o /tmp/apm-studio-logo -w '%{http_code} %{content_type}\n' http://127.0.0.1:43115/apm-studio-icon.png
curl -sS -o /tmp/apm-studio-manifest -w '%{http_code} %{content_type}\n' http://127.0.0.1:43115/site.webmanifest
```

Expected:

- `/` returns `200 text/html`
- `/api/health` returns `200 application/json`
- `/apm-studio-icon.png` returns `200 image/png`
- `/site.webmanifest` returns `200 application/manifest+json`

If `/apm-studio-icon.png` returns `text/html`, production static serving is broken and the SPA fallback is catching root assets.

## Installer Change Checklist

When changing installer behavior:

- update both `public/install.sh` and `public/install.ps1` unless the behavior is platform-specific
- update README install instructions when flags or defaults change
- update this guide
- run Unix syntax validation:

```bash
sh -n public/install.sh
```

- test with a temporary npm prefix and `--no-apm --no-apm-install --no-start`
- verify the installer prints the resolved `apm-studio` command
- verify version output comes from the installed command, not a stale command earlier in `PATH`

## Common Failure Modes

- `npm publish` fails with `EOTP`: no version was published; rerun with a fresh OTP.
- `npm view apm-studio version` does not match the package files: the release is not published or `latest` does not point to it.
- `apm-studio --version` is stale after install: check `which -a apm-studio`, npm global prefix, and shell hash cache.
- the app starts but the browser showed a previous connection error page: reload or open a fresh tab after the server is listening.
- root logo, favicon, manifest, or installer URLs return HTML: production static serving is falling through before serving root client files.
- `dist/cli.js` is not executable in the tarball: check `scripts/copy-runtime-assets.mjs` and rerun `npm run pack:check`.
- `apm install` fails during one-click install: this is an upstream APM/workspace install failure, not an npm package install failure; installer output should make that visible.

## Do Not Do

- do not commit generated `dist/`, `client/`, or `*.tgz` artifacts
- do not publish without a version bump
- do not publish if `npm run type-check`, `npm test`, or `npm run pack:check` fails
- do not assume `npm publish` succeeded after an OTP error
- do not sync external assistant target files as part of normal startup or package publishing
- do not add old product-prefixed environment variables; release/install configuration must use `APM_STUDIO_*`
