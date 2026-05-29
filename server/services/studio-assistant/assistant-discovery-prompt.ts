import type { ApmPackageSummary } from '../../../shared/apm-contracts.js'
import { listApmPackages } from '../apm-package/repository.js'
import { searchImportCatalog } from '../import/registry-service.js'

function shouldDiscoverPackages(message: string) {
    const text = message.toLowerCase()
    return [
        'instruction', 'skill', 'team', 'workflow', 'agent', 'registry', 'install', 'import',
        'search', 'find', 'create', 'build', 'apply', 'use', 'attach',
        '워크플로', '워크플로우', '에이전트', '스킬', '레지스트리',
        '설치', '가져오기', '임포트', '검색', '찾', '만들', '생성', '적용', '사용', '붙여', '연결',
    ].some((token) => text.includes(token))
}

type AssistantSkillIntent = 'create' | 'find' | 'apply' | 'mixed' | null

function mentionsSkillContext(message: string) {
    const text = message.toLowerCase()
    return [
        'skill', 'skills.sh', '스킬',
    ].some((token) => text.includes(token))
}

function inferAssistantSkillIntent(message: string): AssistantSkillIntent {
    if (!mentionsSkillContext(message)) return null

    const text = message.toLowerCase()
    const create =
        [
            'create skill', 'make skill', 'new skill', 'build skill', 'author skill',
            'edit skill', 'update skill', 'improve skill', 'enhance skill',
            'skill creator', 'skill draft',
            '스킬 만들어', '스킬 생성', '스킬 작성', '새 스킬',
            '스킬 수정', '스킬 개선', '스킬 초안',
        ].some((token) => text.includes(token))
        || ['create', 'make', 'build', 'author', 'edit', 'update', 'improve', 'enhance']
            .some((token) => text.includes(token))
        || ['만들', '생성', '작성', '수정', '개선', '고쳐']
            .some((token) => text.includes(token))
    const find =
        [
            'find skill', 'search skill', 'look for skill', 'is there a skill', 'recommend skill',
            'existing skill', 'skills.sh',
            '스킬 찾아', '스킬 검색', '스킬 추천', '기존 스킬',
        ].some((token) => text.includes(token))
        || ['find', 'search', 'recommend'].some((token) => text.includes(token))
        || ['찾', '검색', '추천'].some((token) => text.includes(token))
    const apply =
        [
            'apply skill', 'use skill', 'install skill', 'add skill', 'attach skill', 'import skill',
            '스킬 적용', '스킬 사용', '스킬 설치', '스킬 추가', '스킬 붙여',
        ].some((token) => text.includes(token))
        || ['apply', 'install', 'use', 'attach', 'import'].some((token) => text.includes(token))
        || ['적용', '설치', '사용', '붙여', '추가', '임포트', '가져와'].some((token) => text.includes(token))

    if (create && (find || apply)) return 'mixed'
    if (apply) return 'apply'
    if (find) return 'find'
    if (create) return 'create'
    return null
}

type DiscoveryKind = 'instruction' | 'skill' | 'agent' | 'team'

function inferDiscoveryKinds(message: string): DiscoveryKind[] {
    const text = message.toLowerCase()
    const kinds = new Set<DiscoveryKind>()
    if (text.includes('instruction') || text.includes('인스트럭션') || text.includes('지시문')) kinds.add('instruction')
    if (text.includes('skill') || text.includes('skills.sh') || text.includes('스킬')) kinds.add('skill')
    if (text.includes('agent') || text.includes('에이전트')) kinds.add('agent')
    if (
        text.includes('workflow')
        || text.includes('pipeline')
        || text.includes('team')
        || text.includes('워크플로')
        || text.includes('워크플로우')
        || text.includes('팀')
        || text.includes('파이프라인')
    ) {
        kinds.add('team')
        kinds.add('agent')
    }
    if (kinds.size === 0) {
        kinds.add('agent')
        kinds.add('skill')
    }
    return Array.from(kinds)
}

function buildDiscoveryQuery(message: string) {
    const stopwords = new Set([
        'please', 'help', 'with', 'that', 'this', 'for', 'from', 'into', 'using', 'make', 'create', 'build',
        'find', 'search', 'install', 'import', 'add', 'use', 'want', 'need', 'the', 'a', 'an',
        'skill', 'skills', 'workflow', 'agent', 'instruction', 'pack', 'team',
        '스킬', '워크플로', '워크플로우', '에이전트', '인스트럭션', '지시문',
        '만들', '만들어', '만들어줘', '생성', '생성해', '생성해줘', '찾아', '찾아줘', '검색',
        '검색해', '검색해줘', '설치', '적용', '사용', '추가', '붙여', '가져와', '임포트',
    ])
    const tokens = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@/_\-\s]+/gu, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopwords.has(token))

    return Array.from(new Set(tokens)).slice(0, 6).join(' ').trim()
}

function labelForDiscoveryKind(kind: DiscoveryKind) {
    if (kind === 'instruction') return 'Instruction'
    if (kind === 'skill') return 'Skill'
    if (kind === 'agent') return 'Agent'
    return 'Team'
}

function packageMatchesDiscoveryKind(pkg: ApmPackageSummary, kind: DiscoveryKind) {
    const primitiveCounts = pkg.microsoftApm?.primitiveCounts
    if (kind === 'instruction') {
        return pkg.kind === 'instruction' || (primitiveCounts?.instructions || 0) > 0
    }
    if (kind === 'skill') {
        return pkg.kind === 'skill' || (primitiveCounts?.skills || 0) > 0
    }
    if (kind === 'agent') {
        return pkg.kind === 'agent' || !!pkg.agentComponents || (primitiveCounts?.agents || 0) > 0
    }
    return pkg.kind === 'team'
}

function matchesDiscoveryQuery(candidate: { name?: string; packageId?: string; agentName?: string; description?: string }, query: string) {
    const haystack = `${candidate.name || ''} ${candidate.packageId || ''} ${candidate.agentName || ''} ${candidate.description || ''}`.toLowerCase()
    return query
        .toLowerCase()
        .split(/\s+/)
        .every((token) => !token || haystack.includes(token))
}

function buildAssistantSkillIntentPrompt(intent: AssistantSkillIntent): string[] {
    switch (intent) {
        case 'create':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to create or improve a local Skill.',
                '- Load and use `studio-assistant-skill-creator-guide`.',
                '- Keep creation paths inside APM Studio packages unless the user explicitly asks for external discovery.',
            ]
        case 'find':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to find or compare existing skills.',
                '- Load and use `find-skills`.',
                '- Prefer local Studio package matches first, then Import matches.',
            ]
        case 'apply':
            return [
                'Skill Intent Hint:',
                '- The user likely wants to install or apply an existing skill.',
                '- Load and use `find-skills`.',
                '- Prefer local Studio package matches first, then Import matches.',
                '- If the exact skill is ambiguous, present the best candidates and ask which one to apply.',
                '- Before applying an external source, warn the user briefly to review the source repo, maintainer reputation, and SKILL.md contents.',
            ]
        case 'mixed':
            return [
                'Skill Intent Hint:',
                '- The message mixes local skill authoring with external skill search or apply.',
                '- Ask one short clarifying question: should Studio create a new local Skill, or use an existing external skill?',
                '- Use `studio-assistant-skill-creator-guide` for create/edit paths and `find-skills` for search/apply paths.',
            ]
        default:
            return []
    }
}

export async function buildAssistantDiscoveryPrompt(workingDir: string, userMessage: string): Promise<string> {
    if (!shouldDiscoverPackages(userMessage)) return ''

    const query = buildDiscoveryQuery(userMessage)
    const sections: string[] = []
    const skillIntent = inferAssistantSkillIntent(userMessage)

    sections.push(...buildAssistantSkillIntentPrompt(skillIntent))

    if (!query) {
        return sections.length > 0
            ? [
                'Relevant Package Discovery Hints:',
                ...sections,
                'Use these hints only when they clearly match the user request.',
                'If multiple paths are still reasonable, ask the user which path they want.',
            ].join('\n')
            : ''
    }

    const localPackages = await listApmPackages(workingDir).catch(() => [])

    for (const kind of inferDiscoveryKinds(userMessage).slice(0, 2)) {
        const localMatches = localPackages
            .filter((pkg) => packageMatchesDiscoveryKind(pkg, kind))
            .filter((pkg) => matchesDiscoveryQuery(pkg, query))
            .slice(0, 3)

        if (localMatches.length > 0) {
            sections.push(
                `Local Package ${labelForDiscoveryKind(kind)} matches:`,
                ...localMatches.map((pkg) => `- ${pkg.name} (${pkg.packageId}) [${pkg.manifestPath || 'packages'}]`),
            )
        }

        const registry = await searchImportCatalog({
            q: query,
            kind,
            limit: 4,
        }).catch(() => ({ listings: [] }))
        if (registry.listings.length > 0) {
            sections.push(
                `Import ${labelForDiscoveryKind(kind)} matches:`,
                ...registry.listings.slice(0, 3).map((listing) => `- ${listing.name} (${listing.source.repo}${listing.source.path ? `/${listing.source.path}` : ''})`),
            )
        }
    }

    if (sections.length === 0) return ''

    return [
        'Relevant Package Discovery Hints:',
        ...sections,
        'Use these hints only when they clearly match the user request.',
        'If multiple paths are still reasonable, ask the user which path they want.',
    ].join('\n')
}
