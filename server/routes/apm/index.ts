import { Hono } from 'hono'
import apmPackagesRoutes from './packages.js'
import apmImportRoutes from './import.js'
import apmSyncRoutes from './sync.js'

const apm = new Hono()

apm.route('/', apmPackagesRoutes)
apm.route('/', apmImportRoutes)
apm.route('/', apmSyncRoutes)

export default apm
