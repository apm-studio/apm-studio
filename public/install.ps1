param(
    [string]$Dir = $(Get-Location).Path,
    [string]$StudioPackage = $env:APM_STUDIO_NPM_PACKAGE,
    [string]$StudioVersion = $env:APM_STUDIO_VERSION,
    [string]$ApmInstallerUrl = $env:APM_STUDIO_APM_INSTALLER_URL,
    [string]$Target = $env:APM_STUDIO_APM_TARGET,
    [switch]$NoApm,
    [switch]$NoApmInstall,
    [switch]$Start,
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($StudioVersion)) {
    $StudioVersion = "latest"
}
if ([string]::IsNullOrWhiteSpace($StudioPackage)) {
    $StudioPackage = "apm-studio"
}
if ([string]::IsNullOrWhiteSpace($ApmInstallerUrl)) {
    $ApmInstallerUrl = "https://aka.ms/apm-windows"
}

function Write-Step {
    param([string]$Message)
    Write-Host $Message
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-StudioCommand {
    $command = Get-Command apm-studio -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $null
    }
    if (-not [string]::IsNullOrWhiteSpace($command.Source)) {
        return $command.Source
    }
    return $command.Path
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $paths = @($machinePath, $userPath, $env:Path) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $env:Path = ($paths -join ";")

    if (Test-Command npm) {
        $npmPrefix = (& npm prefix -g 2>$null)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($npmPrefix)) {
            $env:Path = "$npmPrefix;$env:Path"
        }
    }
}

function Assert-Node {
    if (-not (Test-Command node)) {
        throw "Node.js is required. Install Node.js 20.19.0 or newer, then rerun this installer."
    }
    if (-not (Test-Command npm)) {
        throw "npm is required. Install Node.js with npm, then rerun this installer."
    }
    $nodeCheck = "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)"
    & node -e $nodeCheck
    if ($LASTEXITCODE -ne 0) {
        $version = (& node --version 2>$null)
        throw "Node.js 20.19.0 or newer is required. Current version: $version"
    }
}

function Install-Studio {
    Write-Step "Installing $StudioPackage@$StudioVersion..."
    & npm install -g "$StudioPackage@$StudioVersion"
    if ($LASTEXITCODE -ne 0) {
        throw "npm install -g $StudioPackage@$StudioVersion failed."
    }
    Refresh-Path
    $studioCommand = Resolve-StudioCommand
    if ([string]::IsNullOrWhiteSpace($studioCommand)) {
        throw "apm-studio was installed, but the command is not on PATH. Check your npm global prefix."
    }
    $version = (& $studioCommand --version 2>$null)
    Write-Step "APM Studio installed: $version"
    Write-Step "APM Studio command: $studioCommand"
}

function Install-ApmCli {
    if (Test-Command apm) {
        $version = (& apm --version 2>$null)
        Write-Step "APM CLI already installed: $version"
        return
    }

    if ($NoApm -or $env:APM_STUDIO_INSTALL_APM -eq "0") {
        Write-Step "APM CLI is missing and APM installation is disabled. Skipping APM CLI installation."
        return
    }

    Write-Step "APM CLI not found. Running upstream Microsoft APM installer..."
    $installer = Invoke-RestMethod -Uri $ApmInstallerUrl
    Invoke-Expression $installer
    Refresh-Path

    if (-not (Test-Command apm)) {
        throw "APM installer finished, but apm is not on PATH. Open a new terminal or add the install directory to PATH."
    }
    $version = (& apm --version 2>$null)
    Write-Step "APM CLI installed: $version"
}

function Invoke-WorkspaceApmInstall {
    if ($NoApmInstall -or $NoApm -or $env:APM_STUDIO_RUN_APM_INSTALL -eq "0") {
        Write-Step "Skipping apm install."
        return
    }
    if (-not (Test-Command apm)) {
        Write-Step "Skipping apm install because APM CLI is not available."
        return
    }
    if (-not (Test-Path -LiteralPath $Dir -PathType Container)) {
        throw "Workspace directory does not exist: $Dir"
    }

    $manifestPath = Join-Path $Dir "apm.yml"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Write-Step "No apm.yml found in $Dir. Skipping apm install."
        return
    }

    Write-Step "Found apm.yml in $Dir. Running apm install..."
    Push-Location $Dir
    try {
        if ([string]::IsNullOrWhiteSpace($Target)) {
            & apm install
        } else {
            & apm install --target $Target
        }
        if ($LASTEXITCODE -ne 0) {
            throw "apm install failed."
        }
    } finally {
        Pop-Location
    }
}

function Start-Studio {
    $studioCommand = Resolve-StudioCommand
    if ([string]::IsNullOrWhiteSpace($studioCommand)) {
        throw "apm-studio is not on PATH. Check your npm global prefix."
    }
    $shouldStart = $Start -or $env:APM_STUDIO_START -eq "1"
    if ($NoStart -or -not $shouldStart) {
        Write-Step "APM Studio is ready."
        Write-Step "Start it with: & `"$studioCommand`" `"$Dir`""
        return
    }
    Write-Step "Starting APM Studio for $Dir in this terminal..."
    & $studioCommand $Dir
    if ($LASTEXITCODE -ne 0) {
        throw "apm-studio exited with code $LASTEXITCODE."
    }
}

Write-Step "APM Studio one-click installer"
Assert-Node
Refresh-Path
Install-Studio
Install-ApmCli
Invoke-WorkspaceApmInstall
Start-Studio
