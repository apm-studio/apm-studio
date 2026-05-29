import { Hono } from 'hono'
import chatSessions from './sessions.js'
import chatMessages from './messages.js'
import chatStream from './stream.js'

const chat = new Hono()

chat.route('/', chatSessions)
chat.route('/', chatMessages)
chat.route('/', chatStream)

export default chat
