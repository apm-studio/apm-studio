export function slugify(value: string, fallback = 'agent') {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || fallback
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
) {
    if (items.length === 0) return []
    const results = new Array<R>(items.length)
    const normalizedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1
    const workerCount = Math.max(1, Math.min(normalizedConcurrency, items.length))
    let nextIndex = 0

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex
            nextIndex += 1
            results[index] = await mapper(items[index], index)
        }
    }))

    return results
}
