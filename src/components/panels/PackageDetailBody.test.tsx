import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PackageDetailBody from './PackageDetailBody'

describe('PackageDetailBody', () => {
    it('renders GitHub skill sync status and repo drift details', () => {
        const html = renderToStaticMarkup(
            <PackageDetailBody
                item={{
                    kind: 'skill',
                    name: 'research-pack',
                    urn: '/@acme/skill-pack/research-pack',
                    author: '@acme',
                    source: 'workspace',
                    description: 'Research helpers',
                    github: {
                        source: 'github',
                        sourceUrl: 'https://github.com/acme/skill-pack',
                        ref: 'main',
                        repoRootSkillPath: 'skills/research-pack',
                        sync: {
                            state: 'repo_drift',
                            message: 'The source repo now exposes a different set of Skills.',
                            repoDrift: {
                                newSkills: [{
                                    name: 'interview-pack',
                                    urn: '/@acme/skill-pack/interview-pack',
                                    repoRootSkillPath: 'skills/interview-pack',
                                }],
                                missingPackagePrimitiveUrns: ['/@acme/skill-pack/research-pack'],
                            },
                        },
                    },
                }}
                loading={false}
            />,
        )

        expect(html).toContain('GitHub Source')
        expect(html).toContain('Status: Repo drift')
        expect(html).toContain('interview-pack')
        expect(html).toContain('research-pack')
    })
})
