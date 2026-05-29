import { Hono } from 'hono'
import type {
    FileListResponse,
    FileStatusResponse,
    FindFilesResponse,
    FindSymbolsResponse,
    FindTextResponse,
    OpenCodeFileReadResponse,
} from '../../../shared/opencode-contracts.js'
import { jsonOpencodeError } from '../../lib/opencode-errors.js'
import {
    findFilesInProject,
    findSymbolsInProject,
    findTextInProject,
    getFileStatus,
    listFiles,
    readFile,
} from '../../services/opencode/service.js'
import { jsonError, requestWorkingDir } from '../route-errors.js'

const opencodeFile = new Hono()

opencodeFile.get('/api/file/list', async (c) => {
    const dirPath = c.req.query('path') || '.'
    try {
        const response: FileListResponse = {
            entries: await listFiles(requestWorkingDir(c), dirPath),
        }
        return c.json(response)
    } catch {
        return c.json({ entries: [] } satisfies FileListResponse)
    }
})

opencodeFile.get('/api/file/read', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return jsonError(c, 'path required', 400)
    try {
        const response = await readFile(requestWorkingDir(c), filePath)
        return c.json(response satisfies OpenCodeFileReadResponse)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/file/status', async (c) => {
    try {
        const response: FileStatusResponse = {
            files: await getFileStatus(requestWorkingDir(c)),
        }
        return c.json(response)
    } catch {
        return c.json({ files: [] } satisfies FileStatusResponse)
    }
})

opencodeFile.get('/api/find/text', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return jsonError(c, 'pattern required', 400)
    try {
        const response: FindTextResponse = {
            matches: await findTextInProject(requestWorkingDir(c), pattern),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/files', async (c) => {
    const pattern = c.req.query('pattern')
    if (pattern === undefined) return jsonError(c, 'pattern required', 400)
    try {
        const response: FindFilesResponse = {
            files: await findFilesInProject(requestWorkingDir(c), pattern),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/symbols', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return jsonError(c, 'pattern required', 400)
    try {
        const response: FindSymbolsResponse = {
            symbols: await findSymbolsInProject(requestWorkingDir(c), pattern),
        }
        return c.json(response)
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeFile
