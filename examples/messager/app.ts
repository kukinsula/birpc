import * as biclient from '../../src/client';
import { Message, Request } from '../../src/codec';
import { JsonRpcCodec } from '../../src/jsonrpc';
import { PromiseGroup, Result } from '../../src/promise';

import { Server } from './server';
import { Client } from './client';

// TODO:
//
// * Service sous type de Client comme argument:
//     Exec(client: <T extends Client>, ...)
//   Client.Process(msg: Message, client?: Client extends Client = this)
//
// * Fix WaitTimeout qui n'échoue pas quand le timeout est excédé
//
// * PromiseGroup:
//   * Cancel a Wait
//
// * Client.Call(timeout?: number)
//
// * Errors wrap an error e.g ServerError(err: Error)

function main() {
  let server = new Server();

  server.Start();

  process.once('SIGINT', () => {
    console.log('Exiting...');
    let timer = setTimeout(() => {
      exit(2, new Error('Exit timeout'));
    }, 10000);

    server.Close();
  });
}

function exit(code: number, err?: Error) {
  if (err != undefined)
    console.log(`${err.stack}`);

  console.log('Done!');

  process.exit(code);
}

main();
