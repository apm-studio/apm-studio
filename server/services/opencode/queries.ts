import { getOpencode } from '../../lib/opencode.js'
import { OPENCODE_URL } from '../../lib/config.js'
import { canRestartOpencodeSidecar } from '../../lib/opencode-sidecar.js'
import { listStudioTerminalShells } from '../terminal/terminal-shells.js'
import type {
    FileListEntry,
    FileStatusSummary,
    FindSymbolMatch,
    FindTextMatch,
    OpenCodeAgentSummary,
    OpenCodeFileReadResponse,
    OpenCodeHealthResponse,
    TerminalShellSummary,
    VcsStatusResponse,
} from '../../../shared/opencode-contracts.js'
import { responseArrayData, responseData } from './response-data.js'
import {
    normalizeFileListEntry,
    normalizeFileStatusSummary,
    normalizeFindFilePath,
    normalizeFindSymbolMatch,
    normalizeFindTextMatch,
    normalizeOpenCodeAgentSummary,
    normalizeVcsStatus,
} from './query-normalizers.js'

export function opencodeModeMeta() {
    return {
        managed: true,
        mode: 'managed' as const,
        restartAvailable: canRestartOpencodeSidecar(),
    }
}

export async function getOpenCodeHealth(directory: string): Promise<OpenCodeHealthResponse> {
    const oc = await getOpencode()
    const res = await oc.project.current({ directory })
    const data = responseData(res, null)
    return {
        connected: true,
        url: OPENCODE_URL,
        project: data,
        ...opencodeModeMeta(),
    }
}

export function getOpenCodeUnavailableHealth(error: Error): OpenCodeHealthResponse {
    return {
        connected: false,
        error: error.message,
        url: OPENCODE_URL,
        ...opencodeModeMeta(),
    }
}

export async function listOpenCodeAgents(directory: string): Promise<OpenCodeAgentSummary[]> {
    const oc = await getOpencode()
    const res = await oc.app.agents({ directory })
    return responseArrayData(res)
        .map(normalizeOpenCodeAgentSummary)
        .filter((agent): agent is OpenCodeAgentSummary => !!agent)
}

export async function listFiles(directory: string, targetPath: string): Promise<FileListEntry[]> {
    const oc = await getOpencode()
    const res = await oc.file.list({ directory, path: targetPath })
    return responseArrayData(res)
        .map(normalizeFileListEntry)
        .filter((entry): entry is FileListEntry => !!entry)
}

export async function readFile(directory: string, targetPath: string): Promise<OpenCodeFileReadResponse> {
    const oc = await getOpencode()
    const res = await oc.file.read({ directory, path: targetPath })
    const data = responseData<OpenCodeFileReadResponse>(res, {})
    return typeof data.content === 'string' ? { content: data.content } : {}
}

export async function getFileStatus(directory: string): Promise<FileStatusSummary[]> {
    const oc = await getOpencode()
    const res = await oc.file.status({ directory })
    return responseArrayData(res)
        .map(normalizeFileStatusSummary)
        .filter((file): file is FileStatusSummary => !!file)
}

export async function listTerminalShells(_directory: string): Promise<TerminalShellSummary[]> {
    void _directory
    return listStudioTerminalShells()
}

export async function findTextInProject(directory: string, pattern: string): Promise<FindTextMatch[]> {
    const oc = await getOpencode()
    const res = await oc.find.text({ directory, pattern })
    return responseArrayData(res)
        .map(normalizeFindTextMatch)
        .filter((match): match is FindTextMatch => !!match)
}

export async function findFilesInProject(directory: string, pattern: string): Promise<string[]> {
    const oc = await getOpencode()
    const res = await oc.find.files({ directory, query: pattern, dirs: 'false', type: 'file', limit: 50 })
    return responseArrayData(res)
        .map(normalizeFindFilePath)
        .filter((file): file is string => !!file)
}

export async function findSymbolsInProject(directory: string, pattern: string): Promise<FindSymbolMatch[]> {
    const oc = await getOpencode()
    const res = await oc.find.symbols({ directory, query: pattern })
    return responseArrayData(res)
        .map(normalizeFindSymbolMatch)
        .filter((match): match is FindSymbolMatch => !!match)
}

export async function getVcsStatus(directory: string): Promise<VcsStatusResponse> {
    const oc = await getOpencode()
    const res = await oc.vcs.get({ directory })
    return normalizeVcsStatus(responseData<unknown>(res, {}))
}
