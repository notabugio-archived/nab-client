import { ChainGunLinguaStore } from '@lingua-webca/chaingun'
import { store, webca } from '@lingua-webca/core'
import { Config } from '@notabug/peer'
import { NotabugLinguaStore } from './NotabugLinguaStore'

// This is a WIP test/demo of lingua-webca

store.use('gun://', ChainGunLinguaStore.create())
store.use('notabug://', NotabugLinguaStore.create(webca))

webca
  .get(`notabug://${Config.indexer}@notabug.io/t/all/new/things?limit=5`)
  .then((res: any) => {
    console.log('res', JSON.stringify(res, null, 2))
  })
