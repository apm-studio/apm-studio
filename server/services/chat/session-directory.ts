export async function directoryQueryForSession(workingDir: string, sessionId: string): Promise<{ directory: string }> {
    void sessionId
    return {
        directory: workingDir,
    }
}
