import { initAdminDb } from './firebaseAdmin.ts'

const db = initAdminDb()
const tiles = await db.collection('tiles').limit(5).get()
const maps = await db.collection('maps').limit(1).get()
const meta = await db.collection('meta').doc('poiImport').get()

console.log('tiles sample:', tiles.size, tiles.docs.map((d) => d.id))
console.log('maps sample:', maps.size)
console.log('meta/poiImport:', meta.exists ? meta.data() : 'fehlt')
