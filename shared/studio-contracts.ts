export interface StudioConfig {
    theme?: 'light' | 'dark'
    lastWorkspaceId?: string
}

export interface StudioConfigResponse extends StudioConfig {
    projectDir?: string
}

export type StudioConfigPatch = Partial<StudioConfig>

export interface StudioActivateRequest {
    workingDir: string
}

export interface StudioActivateResponse {
    ok: true
    activeProjectDir: string
}

export interface StudioOpenPathRequest {
    path: string
}

export interface StudioOpenPathResponse {
    ok: true
    path: string
}

export interface StudioPickDirectoryResponse {
    path?: string
}

export interface StudioHealthResponse {
    ok: boolean
    project: string
}
