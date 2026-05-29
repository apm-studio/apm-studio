export type Selection<T> = {
    selected: T[]
    omitted: number
}

export function selectPromptEntries<T>(
    entries: T[],
    options: {
        limit: number
        score: (entry: T, index: number) => number
    },
): Selection<T> {
    if (entries.length <= options.limit) {
        return { selected: entries, omitted: 0 }
    }

    const ranked = entries
        .map((entry, index) => ({ entry, index, score: options.score(entry, index) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, options.limit)
        .sort((left, right) => left.index - right.index)

    return {
        selected: ranked.map((item) => item.entry),
        omitted: entries.length - ranked.length,
    }
}
