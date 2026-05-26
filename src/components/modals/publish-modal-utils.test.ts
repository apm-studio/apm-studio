import { beforeAll, describe, expect, it } from 'vitest'

let buildPublishFormSeed: typeof import('./publish-modal-utils').buildPublishFormSeed

beforeAll(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    })

    ;({ buildPublishFormSeed } = await import('./publish-modal-utils'))
})

describe('buildPublishFormSeed', () => {
    it('prefills team save fields from authoring metadata and canvas description', () => {
        expect(buildPublishFormSeed({
            act: {
                id: 'act-1',
                name: 'Review Flow',
                description: 'Coordinate review and approval.',
                position: { x: 0, y: 0 },
                width: 320,
                height: 200,
                participants: {},
                relations: [],
                createdAt: 1,
                meta: {
                    authoring: {
                        slug: 'review-flow',
                        description: 'Registry-ready review workflow',
                        tags: ['workflow', 'review'],
                    },
                },
            },
        })).toEqual({
            slug: 'review-flow',
            description: 'Registry-ready review workflow',
            tagsText: 'workflow, review',
        })
    })

    it('falls back to the canvas act description when authoring description is unset', () => {
        expect(buildPublishFormSeed({
            act: {
                id: 'act-2',
                name: 'Launch Flow',
                description: 'Ship the launch checklist end-to-end.',
                position: { x: 0, y: 0 },
                width: 320,
                height: 200,
                participants: {},
                relations: [],
                createdAt: 1,
            },
        })).toEqual({
            slug: 'launch-flow',
            description: 'Ship the launch checklist end-to-end.',
            tagsText: '',
        })
    })

    it('prefills stage from local asset URNs', () => {
        expect(buildPublishFormSeed({
            localItem: {
                kind: 'tal',
                source: 'local',
                urn: 'tal/@acme/launch-stage/reviewer-tal',
                name: 'reviewer-tal',
                slug: 'reviewer-tal',
            },
        })).toEqual({
            slug: 'reviewer-tal',
            stage: 'launch-stage',
            description: 'reviewer-tal',
            tagsText: '',
        })
    })
})
