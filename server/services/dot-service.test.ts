import { beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const publishStudioAssetMock = vi.fn()
const readDotAuthUserMock = vi.fn()
const searchRegistryMock = vi.fn()
const getRegistryAssetDetailMock = vi.fn()
const assetFilePathMock = vi.fn()
const copySkillDirMock = vi.fn()
const danceAssetDirMock = vi.fn()
const ensureDotDirMock = vi.fn()
const fetchRegistryPackageRawMock = vi.fn()
const parseActAssetMock = vi.fn()
const parseDotAssetMock = vi.fn()
const parsePerformerAssetMock = vi.fn()
const reportInstallMock = vi.fn()
const shallowCloneMock = vi.fn()

vi.mock('../lib/dot-source.js', () => ({
    assetFilePath: assetFilePathMock,
    copySkillDir: copySkillDirMock,
    danceAssetDir: danceAssetDirMock,
    ensureDotDir: ensureDotDirMock,
    fetchRegistryPackageRaw: fetchRegistryPackageRawMock,
    getDotDir: vi.fn(),
    getGlobalCwd: vi.fn(),
    getGlobalDotDir: vi.fn(),
    initRegistry: vi.fn(),
    installActWithDependencies: vi.fn(),
    installAsset: vi.fn(),
    installPerformerWithDeps: vi.fn(),
    parseActAsset: parseActAssetMock,
    parseDotAsset: parseDotAssetMock,
    parsePerformerAsset: parsePerformerAssetMock,
    readAsset: vi.fn(),
    reportInstall: reportInstallMock,
    searchRegistry: searchRegistryMock,
    shallowClone: shallowCloneMock,
    startLogin: vi.fn(),
}))

vi.mock('../lib/dot-authoring.js', () => ({
    clearDotAuthUser: vi.fn(),
    publishStudioAsset: publishStudioAssetMock,
    readDotAuthUser: readDotAuthUserMock,
    saveLocalStudioAsset: vi.fn(),
    uninstallStudioAsset: vi.fn(),
}))

vi.mock('../lib/cache.js', () => ({
    invalidate: vi.fn(),
}))

vi.mock('./asset-service.js', () => ({
    findInstalledDependents: vi.fn(),
    getRegistryAssetDetail: getRegistryAssetDetailMock,
}))

describe('installDotAsset', () => {
    let cwd: string
    let cloneDir: string

    beforeEach(async () => {
        cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-install-'))
        cloneDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dot-studio-clone-'))

        assetFilePathMock.mockReset().mockImplementation((targetCwd: string, urn: string) =>
            path.join(targetCwd, '.agent-roaster', 'assets', `${urn.replace(/[\\/]/g, '__')}.json`),
        )
        copySkillDirMock.mockReset()
        danceAssetDirMock.mockReset().mockImplementation((targetCwd: string, urn: string) =>
            path.join(targetCwd, '.agent-roaster', 'dances', urn.replace(/[\\/]/g, '__')),
        )
        ensureDotDirMock.mockReset().mockResolvedValue(undefined)
        fetchRegistryPackageRawMock.mockReset()
        parseActAssetMock.mockReset().mockImplementation((asset) => asset)
        parseDotAssetMock.mockReset().mockImplementation((asset) => asset)
        parsePerformerAssetMock.mockReset().mockImplementation((asset) => asset)
        reportInstallMock.mockReset().mockResolvedValue(undefined)
        shallowCloneMock.mockReset().mockResolvedValue({
            tempDir: cloneDir,
            cleanup: vi.fn().mockResolvedValue(undefined),
        })
    })

    it('normalizes Windows separators from registry GitHub dance paths before copying', async () => {
        await fs.mkdir(path.join(cloneDir, 'skills', 'pdf'), { recursive: true })
        fetchRegistryPackageRawMock.mockImplementation(async (kind: string, owner: string, stage: string, name: string) => {
            const urn = `${kind}/@${owner}/${stage}/${name}`
            if (kind === 'act') {
                return {
                    payload: {
                        kind: 'act',
                        urn,
                        payload: {
                            participants: [{ key: 'Lead', performer: 'performer/@acme/team/lead' }],
                        },
                    },
                }
            }
            if (kind === 'performer') {
                return {
                    payload: {
                        kind: 'performer',
                        urn,
                        payload: {
                            tal: null,
                            dances: ['dance/@anthropics/skills/pdf'],
                        },
                    },
                }
            }
            if (kind === 'dance') {
                return {
                    payload: { kind: 'dance', urn },
                    resource: {
                        type: 'github',
                        repo: 'anthropics/skills',
                        path: 'skills\\pdf',
                        ref: 'main',
                    },
                }
            }
            return { payload: { kind, urn } }
        })

        const { installDotAsset } = await import('./dot-service.js')
        const result = await installDotAsset(cwd, {
            urn: 'act/@acme/team/research',
            force: true,
            scope: 'stage',
        })

        expect('installedAssets' in result ? result.installedAssets.map((asset: { urn: string }) => asset.urn) : []).toContain('dance/@anthropics/skills/pdf')
        expect(copySkillDirMock).toHaveBeenCalledWith(
            path.join(cloneDir, 'skills', 'pdf'),
            expect.any(String),
            { repoRoot: cloneDir },
        )
    })
})

describe('publishDotAsset', () => {
    beforeEach(() => {
        publishStudioAssetMock.mockReset()
        readDotAuthUserMock.mockReset()
    })

    it('forwards providedAssets to the studio authoring publish boundary', async () => {
        readDotAuthUserMock.mockResolvedValue({
            username: 'acme',
            token: 'token',
        })
        publishStudioAssetMock.mockResolvedValue({
            urn: 'act/@acme/moneymaker/exec-sync',
            published: true,
            dependenciesPublished: ['performer/@acme/moneymaker/ceo'],
            dependenciesSkipped: [],
            dependenciesExisting: [],
        })

        const { publishDotAsset } = await import('./dot-service.js')
        const providedAssets = [{
            kind: 'performer' as const,
            urn: 'performer/@acme/moneymaker/ceo',
            payload: {
                kind: 'performer',
                urn: 'performer/@acme/moneymaker/ceo',
                description: 'CEO',
                payload: {
                    tal: 'tal/@acme/moneymaker/ceo-tal',
                },
            },
            tags: ['executive'],
        }]

        await publishDotAsset('/tmp/moneymaker', {
            kind: 'act',
            slug: 'exec-sync',
            payload: {
                description: 'Exec Sync',
                participants: [
                    { key: 'CEO', performer: 'performer/@acme/moneymaker/ceo' },
                ],
                relations: [],
            },
            tags: ['workflow'],
            providedAssets,
        })

        expect(publishStudioAssetMock).toHaveBeenCalledWith(expect.objectContaining({
            cwd: '/tmp/moneymaker',
            kind: 'act',
            slug: 'exec-sync',
            providedAssets,
            auth: {
                username: 'acme',
                token: 'token',
            },
        }))
    })
})

describe('searchDotRegistry', () => {
    beforeEach(() => {
        searchRegistryMock.mockReset()
        getRegistryAssetDetailMock.mockReset()
    })

    it('hydrates registry performer results with dependency metadata used by Studio drag/drop', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                kind: 'performer',
                name: 'k-lawyer',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
        getRegistryAssetDetailMock.mockResolvedValue({
            kind: 'performer',
            urn: 'performer/@monarchjuno/lawyer/k-lawyer',
            slug: 'k-lawyer',
            name: 'k-lawyer',
            author: '@monarchjuno',
            source: 'registry',
            description: 'Korean lawyer performer',
            tags: ['korean', 'law'],
            talUrn: 'tal/@monarchjuno/lawyer/k-lawyer',
            danceUrns: ['dance/@NomaDamas/k-skill/korean-law-search'],
            model: { provider: 'openai', modelId: 'gpt-5.4' },
            mcpConfig: null,
        })

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer', { kind: 'performer', limit: 10 })

        expect(getRegistryAssetDetailMock).toHaveBeenCalledWith('', 'performer', 'monarchjuno', 'lawyer/k-lawyer')
        expect(results).toEqual([
            expect.objectContaining({
                kind: 'performer',
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                author: '@monarchjuno',
                source: 'registry',
                talUrn: 'tal/@monarchjuno/lawyer/k-lawyer',
                danceUrns: ['dance/@NomaDamas/k-skill/korean-law-search'],
                model: { provider: 'openai', modelId: 'gpt-5.4' },
            }),
        ])
    })

    it('hydrates registry act results with participants and relations used by Studio import', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
                kind: 'act',
                name: 'k-lawyer-review',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean law review act',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:40:00.000Z',
            },
        ])
        getRegistryAssetDetailMock.mockResolvedValue({
            kind: 'act',
            urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
            slug: 'k-lawyer-review',
            name: 'k-lawyer-review',
            author: '@monarchjuno',
            source: 'registry',
            description: 'Korean law review act',
            tags: ['korean', 'law'],
            actRules: ['Escalate uncertainty'],
            participants: [
                { key: 'Lawyer', performer: 'performer/@monarchjuno/lawyer/k-lawyer' },
                { key: 'Reviewer', performer: 'performer/@monarchjuno/lawyer/k-reviewer' },
            ],
            relations: [
                {
                    name: 'peer-review',
                    between: ['Lawyer', 'Reviewer'],
                    direction: 'both',
                    description: 'Review each answer',
                },
            ],
        })

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer-review', { kind: 'act', limit: 10 })

        expect(getRegistryAssetDetailMock).toHaveBeenCalledWith('', 'act', 'monarchjuno', 'lawyer/k-lawyer-review')
        expect(results).toEqual([
            expect.objectContaining({
                kind: 'act',
                urn: 'act/@monarchjuno/lawyer/k-lawyer-review',
                author: '@monarchjuno',
                source: 'registry',
                actRules: ['Escalate uncertainty'],
                participants: [
                    { key: 'Lawyer', performer: 'performer/@monarchjuno/lawyer/k-lawyer' },
                    { key: 'Reviewer', performer: 'performer/@monarchjuno/lawyer/k-reviewer' },
                ],
                relations: [
                    expect.objectContaining({
                        name: 'peer-review',
                        between: ['Lawyer', 'Reviewer'],
                    }),
                ],
            }),
        ])
    })

    it('falls back to summary metadata when detail hydration fails', async () => {
        searchRegistryMock.mockResolvedValue([
            {
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                kind: 'performer',
                name: 'k-lawyer',
                owner: 'monarchjuno',
                stage: 'lawyer',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
        getRegistryAssetDetailMock.mockRejectedValue(new Error('registry detail unavailable'))

        const { searchDotRegistry } = await import('./dot-service.js')
        const results = await searchDotRegistry('k-lawyer', { kind: 'performer', limit: 10 })

        expect(results).toEqual([
            {
                kind: 'performer',
                urn: 'performer/@monarchjuno/lawyer/k-lawyer',
                slug: 'k-lawyer',
                name: 'k-lawyer',
                author: '@monarchjuno',
                source: 'registry',
                description: 'Korean lawyer performer',
                tags: ['korean', 'law'],
                updatedAt: '2026-04-23T09:32:44.329Z',
            },
        ])
    })
})
