import * as net from 'net';

import { Server } from './server';
import { Client } from './client';
import { PromiseGroup, Result } from './promise';

// TODO:
//
// * Server/Client EventEmitter
//   Server Events: listening, connection, error, close, end, shutdown, wait
//   Client Events: start, stop, error, close, end, wait, send
//
// * PromiseGroup:
//   * Constructor avec un Promise<any>[]
//   * Cancel a Wait
//
// * Server prefix dans les logs
// * Server.Wait
// * Client.Wait
// * Client.cancelPendingCalls
// * Keep-Alive
// * Timeout

function main() {
  let address = '127.0.0.1';
  let port = 20000;

  let server = new Server(address, port);

  server.on('listening', () => { console.log(`Server listening at ${address}:${port}`); });
  server.on('error', (err: Error) => { console.log(`Server error: ${err}`); });
  server.on('close', () => { console.log(`Server listening at ${address}:${port} closed`); });
  server.on('shutdown', () => { console.log(`Server listening at ${address}:${port} shutdown`); });
  server.on('waiting', (group: PromiseGroup) => { console.log(`Waiting for ${group.Size()} connections...`); });
  server.on('wait', (res: Result[]) => { console.log(`Done!`); });

  // server.on('connection', (socket: net.Socket) => {
  //   let address = `${socket.remoteAddress}:${socket.remotePort}`;

  //   console.log(`Incoming connection from ${address}`);

  //         // this.group.Add(handleConn.bind(this)(socket)
  //     .then(() => {
  //       socket.end();
  //       console.log(`Connection ${address} ended`);
  //     })
  //     .catch((err: Error) => {
  //       console.error(`Connection ${address} failed:\n` +
  //         `  ${err.name}: ${err.message}\n\n${err.stack}\n`);

  //       socket.end();
  //       console.log(`Connection ${address} ended`);
  //     }));
  // });

  server.Add('Add', (client: Client, args: any): Promise<any> => {
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(args.reduce((acc: number, current: number) => {
          return acc + current;
        }, 0));
      }, 5000);
    });
  });

  server.Add('Mult', (client: Client, args: any): Promise<any> => {
    return Promise.resolve(args.reduce((acc: number, current: number) => {
      return acc * current;
    }, 1));
  });

  server.Start();

  process.on('SIGINT', () => {
    console.log('Exiting...');

    return server.Wait();
  });
}

main();
