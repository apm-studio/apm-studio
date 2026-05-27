import { Hono } from 'hono'
import apmAssetsCore from './apm-assets-core.js'
import apmAssetsPerformer from './apm-assets-performer.js'
import apmAssetsLocal from './apm-assets-local.js'
import apmAssetsDanceExport from './apm-assets-dance-export.js'
import apmAssetsDanceUpdates from './apm-assets-dance-updates.js'

const apm = new Hono()

apm.route('/', apmAssetsCore)
apm.route('/', apmAssetsPerformer)
apm.route('/', apmAssetsLocal)
apm.route('/', apmAssetsDanceExport)
apm.route('/', apmAssetsDanceUpdates)

export default apm
