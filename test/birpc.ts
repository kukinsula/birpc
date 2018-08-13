import * as net from 'net';

// import * as bircp from '../src/birpc';

import { Server } from '../src/server';
import { Client } from '../src/client';
import { Message } from '../src/codec';
import { JsonRpcCodec } from '../src/jsonrpc';
import { PromiseGroup } from '../src/promise';

import { describe, it, before, after } from 'mocha';

const assert = require('assert');

const
  host = '127.0.0.1',
  port = 22000;

var serverOptions = { host: host, port: port };

describe('Server', () => {
  it('Start and Close Server', (done: any) => {
    let server = new Server(serverOptions);

    server.on('close', () => { done(); });
    server.on('listening', () => { server.Close(); });

    server.Start();
  });

  it('Start and Shutdown Server', (done: any) => {
    let server = new Server(serverOptions);

    server.once('close', (err?: Error) => { done(err); });
    server.on('listening', () => { server.Shutdown(); });

    server.Start();
  });

  it('Start, Connect, Call and Close Server', (done: any) => {
    let server = new Server(serverOptions);
    let serverDone = ((err?: Error) => {
      server.Shutdown()
        .then(() => { done(); })
        .catch((err: Error) => { done(err); });
    });

    server.on('connection', (socket: net.Socket) => {
      let client = new Client({
        codec: new JsonRpcCodec(socket),
        server: true
      });

      client.on('receive', (msg: Message) => { client.Process(msg); });
      client.on('send', (msg: Message) => { });

      server.Serve(client);
    });

    server.Add('echo', (client: Client, msg: string): Promise<string> => {
      return Promise.resolve(msg);
    });

    server.Add('error', (client: Client): Promise<void> => {
      return Promise.reject(new Error('This is an Error'));
    });

    server.on('listening', () => {
      let socket = net.createConnection({ port: 22000 }, () => {
        let client = new Client({
          codec: new JsonRpcCodec(socket),
        });

        client.on('receive', (msg: Message) => { client.Process(msg); });
        client.on('send', (msg: Message) => { });

        client.Start();

        client.Call('echo', 'Hello World!')
          .then((resp: string) => {
            assert.equal(resp, 'Hello World!');

            return client.Call('error');
          })
          .then((resp: any) => {
            console.log(resp);

            serverDone();
          })
          .catch((err: Error) => { serverDone(err); });
      });
    });

    server.Start();
  });

  // it('Start, Connect, Call and Close Server', (done: any) => {
  //   let server = new Server(serverOptions);

  //   server.Add('hello', (client: Client, args: any): Promise<any> => {
  //     return Promise.resolve('world');
  //   });

  //   server.Start();

  //   setTimeout(() => {
  //     let socket = net.createConnection({ host: host, port: port }, () => {
  //       let client = new Client({ codec: new JsonRpcCodec(socket) });

  //       client.Start()
  // client.Stop();

  // server.Close();

  // server.Shutdown()
  //   .then(() => {
  //     console.log('server.Shutdown.then 222');
  //   })
  //   .catch((err: Error) => {
  //     console.log('server.Shutdown.catch 222');
  //     done(err);
  //   });

  // client.Call('hello')
  //   .then((res: any) => {
  //     console.log('client.Call.then');

  //     assert(res === 'world', "Result is not 'world'");

  //     server.Shutdown()
  //       .then(() => {
  //         console.log('server.Shutdown.then 111');
  //         done();
  //       })
  //       .catch((err: Error) => {
  //         console.log('server.Shutdown.catch 111');
  //         done(err);
  //       });
  //   })
  //   .catch((err: Error) => {
  //     console.log('client.Call.catch', err);

  //     done(err);

  //     server.Shutdown()
  //       .then(() => {
  //         console.log('server.Shutdown.then 222');
  //         done(err);
  //       })
  //       .catch((err: Error) => {
  //         console.log('server.Shutdown.catch 222');
  //         done(err);
  //       });
  //   });
  // });
  //     }, 10);
  // });
});
