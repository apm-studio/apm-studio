import { Hono } from 'hono'
import teamRuntimeTools from './tools.js'
import teamRuntimeThreads from './threads.js'

const teamRuntime = new Hono()

teamRuntime.route('/', teamRuntimeTools)
teamRuntime.route('/', teamRuntimeThreads)

export default teamRuntime
