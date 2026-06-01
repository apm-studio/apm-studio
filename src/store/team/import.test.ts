import type { PackageLibraryItem } from '../../lib/primitive-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'


import type { StudioState } from '../types'
import { importTeamFromPrimitiveImpl } from './team-import'

vi.mock('../../lib/toast', () => ({
    showToast: vi.fn(),
}))

function createHarness() {
    let state = {
        teams: [],
        agents: [],
        canvasCenter: { x: 600, y: 300 },
        workspaceDirty: false,
        selectedTeamId: null,
        teamEditorState: null,
        recordStudioChange: vi.fn(),
    } as unknown as StudioState

    const set = (partial: Partial<StudioState> | ((current: StudioState) => Partial<StudioState>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial
        state = { ...state, ...next }
    }

    return {
        get: () => state,
        set,
    }
}

describe('importTeamFromPrimitiveImpl', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('materializes registry participants as unresolved package placeholders', async () => {
        const harness = createHarness()
        const agentUrn = 'agent/@monarchjuno/moneymaker/ceo'

        const primitive: PackageLibraryItem = {
            kind: 'team',
            urn: 'team/@monarchjuno/moneymaker/fullteam',
            name: 'fullteam',
            author: '@monarchjuno',
            source: 'workspace',
            participants: [
                { key: 'CEO', agent: agentUrn },
            ],
            relations: [],
        }

        await importTeamFromPrimitiveImpl(harness.get, harness.set, primitive, {
            width: 640,
            height: 420,
        })

        const state = harness.get()
        expect(state.teams).toHaveLength(1)
        expect(state.agents).toHaveLength(1)
        expect(state.agents[0]).toMatchObject({
            name: 'CEO',
            hidden: true,
            model: null,
            skillRefs: [],
            meta: {
                derivedFrom: agentUrn,
                authoring: {
                    description: expect.stringContaining('Placeholder for Team participant'),
                },
            },
        })
    })
})
