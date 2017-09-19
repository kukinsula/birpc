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
      server.Shutdown()
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
            console.log('client.Call.then');

            assert(res === 'world', "Result is not 'world'");

            server.Shutdown()
              .then(() => {
                console.log('server.Shutdown.then 111');
                done();
              })
              .catch((err: Error) => {
                console.log('server.Shutdown.catch 111');
                done(err);
              });
          })
          .catch((err: Error) => {
            console.log('client.Call.catch', err);

            // done(err);

            server.Shutdown()
              .then(() => {
                console.log('server.Shutdown.then 222');
                done(err);
              })
              .catch((err: Error) => {
                console.log('server.Shutdown.catch 222');
                done(err);
              });
          });
      });
    }, 10);
  });
});
