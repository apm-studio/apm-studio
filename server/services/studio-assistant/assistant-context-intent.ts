const ASSISTANT_CONTEXT_STOPWORDS = new Set([
    'please', 'help', 'with', 'that', 'this', 'for', 'from', 'into', 'using', 'make', 'create', 'build',
    'find', 'search', 'install', 'import', 'add', 'use', 'want', 'need', 'the', 'a', 'an', 'and', 'or',
    'open', 'show', 'hide', 'move', 'resize', 'arrange', 'inspect', 'focus', 'update', 'delete',
    'studio', 'assistant', 'workspace', 'canvas', 'editor', 'panel',
    '좀', '주세요', '해줘', '해', '만들', '만들어', '생성', '열어', '보여', '숨겨', '옮겨', '이동',
    '정리', '배치', '수정', '삭제', '찾아', '검색', '스튜디오', '어시스턴트',
])

export type AssistantPromptIntent = {
    tokens: string[]
    includeGeometry: boolean
    includeModelVariants: boolean
    includeTeamDetails: boolean
    includeDraftDetails: boolean
    includeAll: boolean
}

export function normalizeSearchText(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@/_\-\s.]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function includesAny(text: string, needles: string[]) {
    return needles.some((needle) => text.includes(needle))
}

export function inferAssistantPromptIntent(userMessage: string | undefined): AssistantPromptIntent {
    const text = normalizeSearchText(userMessage)
    const tokens = Array.from(new Set(
        text
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !ASSISTANT_CONTEXT_STOPWORDS.has(token)),
    )).slice(0, 12)

    const includeGeometry = includesAny(text, [
        'open', 'show', 'focus', 'reveal', 'hide', 'hidden', 'visible', 'visibility', 'move', 'resize',
        'arrange', 'layout', 'position', 'panel', 'canvas', 'editor', 'inspect',
        '열', '보여', '숨', '표시', '이동', '옮', '크기', '배치', '정렬', '패널', '캔버스', '편집',
    ])
    const includeModelVariants = includesAny(text, [
        'model', 'variant', 'gpt', 'claude', 'openai', 'anthropic', 'reasoning',
        '모델', '변형', '추론',
    ])
    const includeTeamDetails = includesAny(text, [
        'workflow', 'team', 'pipeline', 'participant', 'relation', 'subscription', 'safety',
        'handoff', 'thread', 'wake',
        '워크플로', '워크플로우', '팀', '파이프라인', '참여', '관계', '구독', '핸드오프',
    ])
    const includeDraftDetails = includesAny(text, [
        'instruction', 'skill', 'draft', 'bundle', 'reference', 'script',
        '스킬', '초안', '번들',
    ])
    const includeAll = includesAny(text, [
        'all', 'every', 'entire', 'everything', 'list', 'overview', 'arrange', 'layout',
        '전체', '모두', '전부', '목록', '개요', '배치', '정렬',
    ])

    return {
        tokens,
        includeGeometry,
        includeModelVariants,
        includeTeamDetails,
        includeDraftDetails,
        includeAll,
    }
}

export function scoreByTokens(haystack: string, tokens: string[]) {
    if (tokens.length === 0) return 0
    const text = normalizeSearchText(haystack)
    return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0)
}
