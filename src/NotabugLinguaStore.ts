import { unpackNode } from '@chaingun/sea-client'
import {
  ExpressLikeStore,
  LinguaWebcaClient,
  LinguaWebcaStore,
  PathPrefixedStore,
  SimpleClient,
  SwitchingStore,
  webca as universe
} from '@lingua-webca/core'
import { Config, Listing, Schema } from '@notabug/peer'
import { parse as parseQuery } from 'query-string'
import { parse as uriParse } from 'uri-js'

// This is a WIP, this API will change

// tslint:disable-next-line: typedef
export function createSpecificNabStore(
  indexer: string,
  host: string,
  webca: LinguaWebcaClient = universe
) {
  const app = new ExpressLikeStore()
  const tabulator = indexer
  const self = SimpleClient.create(app.request)

  app.get('/t/:topic/:sort/things', async (req, res) => {
    const listingPath = `/t/${req.params.topic}/${req.params.sort}`
    const { ids } = await self.get(listingPath)
    const query = parseQuery(req.query || '')
    const offset = parseInt(query.offset as string, 10) || 0
    const limit = parseInt(query.limit as string, 10) || 25
    const things = await Promise.all(
      ids
        .slice(offset, offset + limit)
        .map(([thingId]: readonly [string, number]) =>
          self.get(`/things/${thingId}`)
        )
    )

    res.json({
      things
    })
  })

  app.get('/t/:topic/:sort', async (req, res) => {
    const soul = Schema.TopicListing.route.reverse({
      indexer,
      sort: req.params.sort,
      topic: req.params.topic
    })

    const rawListing = await webca.get(`gun://${host}/${soul}`)
    const listing = unpackNode(rawListing)
    const rows = Listing.ListingNode.rows(listing)

    res.json({
      ids: Listing.ListingNode.rowsToItems(rows)
    })
  })

  app.get('/things/:thingId/votes', async (req, res) => {
    const { thingId } = req.params
    const upSoul = Schema.ThingVotesUp.route.reverse({
      thingId
    })
    const downSoul = Schema.ThingVotesUp.route.reverse({
      thingId
    })

    const [up, down] = await Promise.all([
      webca.get(`gun://${host}/${upSoul}`),
      webca.get(`gun://${host}/${downSoul}`)
    ])

    res.json({
      down,
      up
    })
  })

  app.get('/things/:thingId', async (req, res) => {
    const { thingId } = req.params
    const thingSoul = Schema.Thing.route.reverse({ thingId })
    const countsSoul = Schema.ThingVoteCounts.route.reverse({
      tabulator,
      thingId
    })
    const [thing, rawCounts] = await Promise.all([
      webca.get(`gun://${host}/${thingSoul}`),
      webca.get(`gun://${host}/${countsSoul}`)
    ])
    const counts = unpackNode(rawCounts)
    const dataSoul = thing && thing.data && thing.data['#']

    if (!dataSoul) {
      throw new Error('No data soul')
    }

    const rawData = await webca.get(`gun://${host}/${dataSoul}`)
    const data = unpackNode(rawData)

    res.json({
      counts,
      data,
      thing
    })
  })

  return app.request
}

export function createNabStore(
  webca: LinguaWebcaClient = universe
): LinguaWebcaStore {
  const storeCache: Record<string, LinguaWebcaStore> = {}

  return SwitchingStore.create(request => {
    const { scheme, host, port, userinfo } = uriParse(request.uri)
    const indexer = userinfo || Config.indexer

    // tslint:disable-next-line: no-if-statement
    if (scheme !== 'notabug') {
      return () =>
        Promise.resolve({
          body: `Invalid notabug uri scheme ${scheme}`,
          code: 500,
          request,
          uri: request.uri
        })
    }

    // tslint:disable-next-line: no-if-statement
    if (!host) {
      return () =>
        Promise.resolve({
          body: `Invalid notabug uri host`,
          code: 500,
          request,
          uri: request.uri
        })
    }

    const basePath = `${scheme}://${userinfo ? `${userinfo}@` : ''}${host}${
      port ? `:${port}` : ''
    }`
    let store = storeCache[host]

    if (!store) {
      store = PathPrefixedStore.create(
        basePath,
        createSpecificNabStore(indexer, host, webca)
      )
    }

    return store
  })
}

export const NotabugLinguaStore = {
  create: createNabStore,
  createSpecific: createSpecificNabStore
}
