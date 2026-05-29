import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import healthRoutes from './routes/health/index.js'
import studioRoutes from './routes/studio/index.js'
import workspaceRoutes from './routes/workspaces/index.js'
import chatRoutes from './routes/chat/index.js'
import opencodeRoutes from './routes/opencode/index.js'
import compileRoutes from './routes/compile/index.js'
import draftRoutes from './routes/drafts/index.js'
import teamRuntimeRoutes from './routes/team-runtime/index.js'
import discordRoutes from './routes/discord/index.js'
import apmRoutes from './routes/apm/index.js'
import createTerminalRoutes from './routes/terminal/index.js'
import { getActiveProjectDir, IS_PRODUCTION } from './lib/config.js'
import { requestLogger } from './lib/server-logger.js'

function resolveClientDir() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
        path.resolve(__dirname, '..', '..', 'client'),
        path.resolve(__dirname, '..', 'client'),
    ]

    return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || candidates[0]
}

function mountApiRoutes(app: Hono) {
    app.route('/', healthRoutes)
    app.route('/', studioRoutes)
    app.route('/', workspaceRoutes)
    app.route('/', chatRoutes)
    app.route('/', opencodeRoutes)
    app.route('/', compileRoutes)
    app.route('/', draftRoutes)
    app.route('/', teamRuntimeRoutes)
    app.route('/', discordRoutes)
    app.route('/', apmRoutes)
    app.route('/', createTerminalRoutes(() => getActiveProjectDir()))
}

function applyDevCors(app: Hono) {
    app.use('*', cors({
        origin: (origin) => (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
                ? origin
                : null
        ),
    }))
}

function mountProductionClient(app: Hono) {
    const clientDir = resolveClientDir()

    app.use('/assets/*', serveStatic({ root: clientDir }))

    app.get('*', async (c) => {
        const indexPath = path.join(clientDir, 'index.html')
        if (fs.existsSync(indexPath)) {
            const html = fs.readFileSync(indexPath, 'utf-8')
            return c.html(html)
        }
        return c.text('Not found', 404)
    })
}

export function createServerApp() {
    const app = new Hono()

    app.use('*', requestLogger)

    if (!IS_PRODUCTION) {
        applyDevCors(app)
    }

    mountApiRoutes(app)

    if (IS_PRODUCTION) {
        mountProductionClient(app)
    }

    return app
}
