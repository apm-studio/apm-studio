import { Hono } from 'hono'
import draftsCollection from './collection.js'
import draftsItem from './item.js'
import draftsSkillBundle from './skill-bundle.js'

const drafts = new Hono()

drafts.route('/', draftsCollection)
drafts.route('/', draftsSkillBundle)
drafts.route('/', draftsItem)

export default drafts
