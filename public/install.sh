#!/usr/bin/env sh
set -eu

STUDIO_PACKAGE="${APM_STUDIO_NPM_PACKAGE:-apm-studio}"
STUDIO_VERSION="${APM_STUDIO_VERSION:-latest}"
WORK_DIR="${APM_STUDIO_WORK_DIR:-$(pwd)}"
APM_INSTALLER_URL="${APM_STUDIO_APM_INSTALLER_URL:-https://aka.ms/apm-unix}"
INSTALL_APM="${APM_STUDIO_INSTALL_APM:-1}"
RUN_APM_INSTALL="${APM_STUDIO_RUN_APM_INSTALL:-1}"
START_STUDIO="${APM_STUDIO_START:-1}"
APM_TARGET="${APM_STUDIO_APM_TARGET:-}"

usage() {
    cat <<'EOF'
APM Studio installer

Usage:
  curl -fsSL https://apm.studio/install.sh | sh
  curl -fsSL https://apm.studio/install.sh | sh -s -- --dir /path/to/project

Options:
  --dir PATH             Workspace directory. Defaults to the current directory.
  --studio-version VER   npm version or tag for apm-studio. Defaults to latest.
  --target TARGET        Run apm install with --target TARGET when apm.yml exists.
  --no-apm               Do not install the APM CLI if it is missing.
  --no-apm-install       Do not run apm install for the workspace.
  --no-start             Do not start apm-studio after installation.
  --apm-installer-url U  Override the upstream Microsoft APM installer URL.
  --help                 Show this help.

Environment:
  APM_STUDIO_NPM_PACKAGE
  APM_STUDIO_VERSION
  APM_STUDIO_WORK_DIR
  APM_STUDIO_APM_INSTALLER_URL
  APM_STUDIO_INSTALL_APM=0
  APM_STUDIO_RUN_APM_INSTALL=0
  APM_STUDIO_START=0
  APM_STUDIO_APM_TARGET
EOF
}

log() {
    printf '%s\n' "$*"
}

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

need_value() {
    [ "$#" -gt 1 ] || fail "$1 requires a value."
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dir)
            need_value "$@"
            shift
            WORK_DIR="$1"
            ;;
        --dir=*)
            WORK_DIR="${1#--dir=}"
            ;;
        --studio-version)
            need_value "$@"
            shift
            STUDIO_VERSION="$1"
            ;;
        --studio-version=*)
            STUDIO_VERSION="${1#--studio-version=}"
            ;;
        --target)
            need_value "$@"
            shift
            APM_TARGET="$1"
            ;;
        --target=*)
            APM_TARGET="${1#--target=}"
            ;;
        --apm-installer-url)
            need_value "$@"
            shift
            APM_INSTALLER_URL="$1"
            ;;
        --apm-installer-url=*)
            APM_INSTALLER_URL="${1#--apm-installer-url=}"
            ;;
        --no-apm)
            INSTALL_APM=0
            RUN_APM_INSTALL=0
            ;;
        --no-apm-install)
            RUN_APM_INSTALL=0
            ;;
        --no-start)
            START_STUDIO=0
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            fail "Unknown option: $1"
            ;;
    esac
    shift
done

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

refresh_path() {
    if command_exists npm; then
        NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
        if [ -n "$NPM_PREFIX" ]; then
            PATH="$NPM_PREFIX/bin:$NPM_PREFIX:$PATH"
        fi
    fi
    PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
    export PATH
    hash -r 2>/dev/null || true
}

check_node() {
    command_exists node || fail "Node.js is required. Install Node.js 20.19.0 or newer, then rerun this installer."
    command_exists npm || fail "npm is required. Install Node.js with npm, then rerun this installer."
    node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)' \
        || fail "Node.js 20.19.0 or newer is required. Current version: $(node --version 2>/dev/null || printf unknown)"
}

install_studio() {
    log "Installing ${STUDIO_PACKAGE}@${STUDIO_VERSION}..."
    npm install -g "${STUDIO_PACKAGE}@${STUDIO_VERSION}"
    refresh_path
    command_exists apm-studio || fail "apm-studio was installed, but the command is not on PATH. Check your npm global prefix."
    log "APM Studio installed: $(apm-studio --version 2>/dev/null || printf available)"
}

install_apm_cli() {
    if command_exists apm; then
        log "APM CLI already installed: $(apm --version 2>/dev/null || printf available)"
        return
    fi

    [ "$INSTALL_APM" = "1" ] || {
        log "APM CLI is missing and --no-apm was set. Skipping APM CLI installation."
        return
    }

    log "APM CLI not found. Running upstream Microsoft APM installer..."
    if command_exists curl; then
        curl -fsSL "$APM_INSTALLER_URL" | sh
    elif command_exists wget; then
        wget -qO- "$APM_INSTALLER_URL" | sh
    else
        fail "curl or wget is required to install APM CLI from $APM_INSTALLER_URL."
    fi

    refresh_path
    command_exists apm || fail "APM installer finished, but apm is not on PATH. Open a new terminal or add the install directory to PATH."
    log "APM CLI installed: $(apm --version 2>/dev/null || printf available)"
}

run_workspace_apm_install() {
    [ "$RUN_APM_INSTALL" = "1" ] || {
        log "Skipping apm install because --no-apm-install was set."
        return
    }
    command_exists apm || {
        log "Skipping apm install because APM CLI is not available."
        return
    }
    [ -d "$WORK_DIR" ] || fail "Workspace directory does not exist: $WORK_DIR"
    [ -f "$WORK_DIR/apm.yml" ] || {
        log "No apm.yml found in $WORK_DIR. Skipping apm install."
        return
    }

    log "Found apm.yml in $WORK_DIR. Running apm install..."
    if [ -n "$APM_TARGET" ]; then
        (cd "$WORK_DIR" && apm install --target "$APM_TARGET")
    else
        (cd "$WORK_DIR" && apm install)
    fi
}

start_studio() {
    [ "$START_STUDIO" = "1" ] || {
        log "APM Studio is ready. Start it with: apm-studio \"$WORK_DIR\""
        return
    }
    log "Starting APM Studio for $WORK_DIR..."
    exec apm-studio "$WORK_DIR"
}

log "APM Studio one-click installer"
check_node
refresh_path
install_studio
install_apm_cli
run_workspace_apm_install
start_studio
