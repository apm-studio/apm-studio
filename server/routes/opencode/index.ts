import { Hono } from 'hono'
import opencodeCore from './core.js'
import opencodeProvider from './provider.js'
import opencodeMcp from './mcp.js'
import opencodeFile from './file.js'
import usageRoutes from './usage.js'

const opencode = new Hono()

opencode.route('/', opencodeCore)
opencode.route('/', opencodeProvider)
opencode.route('/', opencodeMcp)
opencode.route('/', opencodeFile)
opencode.route('/', usageRoutes)

export default opencode
