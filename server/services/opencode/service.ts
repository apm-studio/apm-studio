/**
 * Route-facing OpenCode service surface.
 *
 * Keep behavior in focused sibling modules and re-export it here so route
 * handlers and older service callers have one stable boundary.
 */

export { responseData } from './response-data.js'

export {
    findFilesInProject,
    findSymbolsInProject,
    findTextInProject,
    getFileStatus,
    getOpenCodeHealth,
    getOpenCodeUnavailableHealth,
    getVcsStatus,
    listFiles,
    listOpenCodeAgents,
    listTerminalShells,
    opencodeModeMeta,
    readFile,
} from './queries.js'

export {
    getGlobalOpenCodeConfig,
    mergeProjectConfig,
    readProjectConfigFromOpencode,
    readProjectConfigSnapshot,
    updateGlobalOpenCodeConfig,
    updateProjectOpenCodeConfig,
} from './config.js'

export {
    authorizeProviderOauth,
    completeProviderOauth,
    deleteProviderAuth,
    getProviderAuthMethods,
    updateProviderAuth,
} from './provider-auth.js'

export {
    authenticateMcp,
    completeMcpAuth,
    connectMcpServer,
    getStudioMcpCatalog,
    listMcpServers,
    removeMcpAuth,
    runMcpMutation,
    startMcpAuth,
    updateStudioMcpCatalog,
    validateMcpAuthRequest,
} from './mcp.js'

export { restartManagedOpenCode } from './runtime.js'
