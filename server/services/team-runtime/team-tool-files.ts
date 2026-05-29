import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { COLLABORATION_TOOL_NAMES, getStaticTeamTools } from './team-tools.js'

export function buildTeamToolMap() {
    return Object.fromEntries(COLLABORATION_TOOL_NAMES.map((toolName) => [toolName, true] as const))
}

export async function ensureTeamToolFiles(
    executionDir: string,
    workingDir: string,
): Promise<void> {
    const teamTools = getStaticTeamTools(workingDir)
    const toolsDir = join(executionDir, '.opencode', 'tools')
    await fs.mkdir(toolsDir, { recursive: true })

    const genericToolNames = new Set<string>(teamTools.map((tool) => tool.name))
    const collaborationToolNames = new Set<string>(COLLABORATION_TOOL_NAMES)

    try {
        const existing = await fs.readdir(toolsDir)
        for (const file of existing) {
            if (!file.endsWith('.ts')) continue
            const toolName = file.replace(/\.ts$/, '')
            if (collaborationToolNames.has(toolName) && !genericToolNames.has(toolName)) {
                await fs.rm(join(toolsDir, file), { force: true }).catch(() => {})
            }
        }
    } catch {
        // tools dir may not exist yet
    }

    for (const tool of teamTools) {
        await fs.writeFile(join(toolsDir, `${tool.name}.ts`), tool.content, 'utf-8')
    }
}
