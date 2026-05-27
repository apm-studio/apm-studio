import { Hono } from 'hono'
import apmPackagesRoutes from './apm-packages.js'
import apmImportRoutes from './apm-import.js'
import apmSyncRoutes from './apm-sync.js'

const apm = new Hono()

apm.route('/', apmPackagesRoutes)
apm.route('/', apmImportRoutes)
apm.route('/', apmSyncRoutes)

export default apm
