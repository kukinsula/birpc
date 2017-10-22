import * as net from 'net';

import * as birpc from '../../src/birpc';

import { Server } from './server';
import { Client } from './client';

// TODO:
//
// * Fix WaitTimeout qui n'échoue pas quand le timeout est excédé
//
// * PromiseGroup:
//   * Cancel a Wait
//
// * Client.Call(timeout?: number)

function main() {
  let server = new Server();

  let client: Client;
  let timer: NodeJS.Timer;

  server.on('close', () => {
    if (timer != undefined)
      clearTimeout(timer);

    exit(0);
  });

  process.once('SIGINT', () => {
    console.log('Exiting...');
    timer = setTimeout(() => {
      exit(2, new Error('Exit timeout'));
    }, 10000);

    server.Close();
    client.Stop();
  });

  server.on('listening', () => {
    let socket = net.createConnection({ port: 20000 }, () => {
      client = new Client({
        codec: new birpc.JsonRpcCodec(socket),
        // timeout: 20000,
        keepALiveDelay: 20000
      });

      client.Start();

      setInterval(() => {
        client.Call('mult', [1, 2, 3, 4, 5]);
      }, 1000);
    });
  });

  server.Start();
}

function exit(code: number, err?: Error) {
  if (err != undefined)
    console.log(`${err.stack}`);

  console.log('Done!');

  process.exit(code);
}

main();
