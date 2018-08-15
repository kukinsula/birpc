import * as net from 'net';

import * as birpc from '../../src/birpc';

import { Server } from './server';

// TODO:
//
// * Fix WaitTimeout qui n'échoue pas quand le timeout est excédé
//
// * PromiseGroup:
//   * Cancel a Wait
//
// * Client.Call(timeout?: number)

const PORT = 20000;

function main() {
  let server = new Server();

  process.once('SIGINT', () => {
    console.log(`Exiting (${server.Size()} clients)...`);

    server.Shutdown()
      .then(() => { exit(0); })
      .catch((err: Error) => { exit(1, err); });
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
