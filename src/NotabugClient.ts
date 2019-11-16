import {
  ChainGunSeaClient,
  GunGraph,
  GunGraphAdapter,
  GunGraphConnector,
  GunGraphConnectorFromAdapter
} from '@chaingun/sea-client';
// tslint:disable-next-line: no-implicit-dependencies
import { pubFromSoul, unpackNode } from '@chaingun/sear';
import SocketClusterGraphConnector from '@chaingun/socketcluster-connector';
import { Query } from '@notabug/peer';
// tslint:disable-next-line: no-implicit-dependencies no-submodule-imports
import { SCServerOptions } from 'socketcluster-server/scserver';

const READ_TIMEOUT = 10000;

interface Opts {
  readonly readTimeout?: number;
  readonly socketCluster?: SCServerOptions;
}

const DEFAULT_OPTS: Opts = {
  readTimeout: READ_TIMEOUT,
  socketCluster: {
    autoReconnect: true,
    hostname: process.env.GUN_SC_HOST || '127.0.0.1',
    path: process.env.GUN_SC_PATH || '/socketcluster',
    port: parseInt(process.env.GUN_SC_PORT || '', 10) || 4444
  }
};

export class NotabugClient extends ChainGunSeaClient {
  protected readonly socket: SocketClusterGraphConnector;
  protected readonly dbAdapter: GunGraphAdapter;
  protected readonly dbConnector: GunGraphConnector;
  protected readonly readTimeout: number;

  constructor(dbAdapter: GunGraphAdapter, options = DEFAULT_OPTS) {
    const { readTimeout, socketCluster: scOpts, ...opts } = {
      ...DEFAULT_OPTS,
      ...options
    };

    const graph = new GunGraph();
    const dbConnector = new GunGraphConnectorFromAdapter(dbAdapter);
    const socket = new SocketClusterGraphConnector(options.socketCluster);

    dbConnector.sendRequestsFromGraph(graph);
    dbConnector.sendPutsFromGraph(graph);

    graph.connect(dbConnector as any);

    super({ graph, ...opts });
    this.directRead = this.directRead.bind(this);
    this.readTimeout = readTimeout || READ_TIMEOUT;
    this.socket = socket;
    this.dbAdapter = dbAdapter;
    this.dbConnector = dbConnector;
  }

  public newScope(): any {
    return Query.createScope(
      { gun: this },
      {
        getter: this.directRead,
        unsub: true
      }
    );
  }

  public authenticate(): void {
    if (process.env.GUN_ALIAS && process.env.GUN_PASSWORD && !this.user().is) {
      this.user()
        .auth(process.env.GUN_ALIAS, process.env.GUN_PASSWORD)
        .then(() => {
          // tslint:disable-next-line: no-console
          console.log(`Logged in as ${process.env.GUN_ALIAS}`);
        });
    }
  }

  protected directRead(soul: string): Promise<any> {
    return new Promise((ok, fail) => {
      const timeout = setTimeout(
        () => fail(new Error('Read timeout')),
        this.readTimeout
      );

      function done(val: any): void {
        clearTimeout(timeout);
        ok(val);
      }

      this.dbAdapter.get(soul).then(node => {
        if (pubFromSoul(soul)) {
          unpackNode(node, 'mutable');
        }

        done(node);
      });
    });
  }
}
