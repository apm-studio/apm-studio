// 8PM Studio add service: installs Skills from a GitHub repo.
import path from 'path'
import {
    parseSource,
    shallowClone,
    ensureRosterDir,
    getGlobalCwd,
} from '../lib/roster-source.js'
import { invalidate } from '../lib/cache.js'
import {
    buildGitHubDanceLockEntryInput,
    copyGitHubDanceSkill,
    discoverGitHubDanceSkills,
    getGitHubTreeSha,
    resolveGitHubRef,
    upsertGitHubDanceLockEntry,
} from './dance-github-source.js'

export interface AddResult {
    installed: Array<{ urn: string; name: string; description: string }>
    source: string
}

export async function addDanceFromGitHub(cwd: string, source: string, scope?: 'global' | 'stage'): Promise<AddResult> {
    const parsed = parseSource(source)
    const resolvedRef = await resolveGitHubRef(parsed.owner, parsed.repo, parsed.ref)

    const { tempDir, cleanup } = await shallowClone({ url: parsed.url, ref: resolvedRef !== 'HEAD' ? resolvedRef : undefined })

    try {
        let skills = await discoverGitHubDanceSkills(tempDir, parsed)

        // Apply skill filter from @skill shorthand
        if (parsed.skillFilter) {
            skills = skills.filter((s) => s.skill.name === parsed.skillFilter)
            if (skills.length === 0) {
                throw new Error(`Skill '${parsed.skillFilter}' not found in ${parsed.url}`)
            }
        }

        if (skills.length === 0) {
            throw new Error(`No SKILL.md files found in ${source}`)
        }

        // Install each skill — use global cwd when scope is 'global'
        const targetCwd = scope === 'global' ? getGlobalCwd() : cwd
        const owner = parsed.owner
        const stage = parsed.repo
        const installed: AddResult['installed'] = []

        await ensureRosterDir(targetCwd)

        for (const skill of skills) {
            const urn = `dance/@${owner}/${stage}/${skill.skill.name}`
            const srcDir = path.dirname(skill.skill.skillMdPath)
            const remoteHash = await getGitHubTreeSha(
                parsed.owner,
                parsed.repo,
                resolvedRef,
                skill.repoRootSkillPath,
            )

            await copyGitHubDanceSkill(targetCwd, urn, srcDir, { repoRoot: tempDir })
            await upsertGitHubDanceLockEntry(
                targetCwd,
                urn,
                buildGitHubDanceLockEntryInput(
                    parsed,
                    resolvedRef,
                    skill.repoRootSkillPath,
                    remoteHash.status === 'ok' ? remoteHash.hash : undefined,
                ),
            )

            installed.push({ urn, name: skill.skill.name, description: skill.skill.description })
        }

        invalidate('assets')
        return { installed, source: parsed.url }
    } finally {
        await cleanup()
    }
}
