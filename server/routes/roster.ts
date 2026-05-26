import { Hono } from 'hono'
import rosterCore from './roster-core.js'
import rosterPerformer from './roster-performer.js'
import rosterAssets from './roster-assets.js'
import rosterDanceExport from './roster-dance-export.js'
import rosterDanceUpdates from './roster-dance-updates.js'

const roster = new Hono()

roster.route('/', rosterCore)
roster.route('/', rosterPerformer)
roster.route('/', rosterAssets)
roster.route('/', rosterDanceExport)
roster.route('/', rosterDanceUpdates)

export default roster
