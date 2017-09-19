import * as net from 'net';

import { describe, it, before, after } from 'mocha';

import { Server } from '../src/server';
import { Client } from '../src/client';
import { JsonRpcCodec } from '../src/jsonrpc';

const assert = require('assert');

const
  host = '127.0.0.1',
  port = 22000;

describe('Server', () => {
  it('Start and Close Server', (done: any) => {
    let server = new Server(host, port);

    server.Start();

    setTimeout(() => {
      server.Close()
        .then(() => { done(); })
        .catch((err: Error) => { done(err); });
    }, 10);
  });

  it('Start, Connect, Call and Close Server', (done: any) => {
    let server = new Server(host, port);

    server.Add('hello', (client: Client, args: any): Promise<any> => {
      return Promise.resolve('world');
    });

    server.Start();

    setTimeout(() => {
      let socket = net.createConnection({ host: host, port: port }, () => {
        let client = new Client(new JsonRpcCodec(socket));

        client.Start()
          .then(() => { })
          .catch((err: Error) => { done(err); });

        client.Call('hello')
          .then((res: any) => {
            assert(res === 'world', "Result is not 'world'");

            server.Close()
              .then(() => { done(); })
              .catch((err: Error) => { done(err); });
          })
          .catch((err: Error) => {
            // done(err);

            server.Close()
              .then(() => { done(err); })
              .catch((err: Error) => { done(err); });
          });
      });
    }, 10);
  });
});
