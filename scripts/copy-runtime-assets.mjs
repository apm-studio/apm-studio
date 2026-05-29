import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

const assetCopies = [
    {
        source: path.join(rootDir, 'server', 'services', 'studio-assistant', 'agent'),
        target: path.join(rootDir, 'dist', 'server', 'services', 'studio-assistant', 'agent'),
    },
    {
        source: path.join(rootDir, 'server', 'services', 'studio-assistant', 'skills'),
        target: path.join(rootDir, 'dist', 'server', 'services', 'studio-assistant', 'skills'),
    },
]

for (const assetCopy of assetCopies) {
    await fs.access(assetCopy.source)
    await fs.rm(assetCopy.target, { recursive: true, force: true })
    await fs.mkdir(path.dirname(assetCopy.target), { recursive: true })
    await fs.cp(assetCopy.source, assetCopy.target, { recursive: true })
}
