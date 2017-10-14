import * as net from 'net';

import { Server } from './server';
import { Client } from './client';
import { JsonRpcCodec } from './jsonrpc';
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
// * Keep-Alive
// * Timeout

function main() {
  let hostname = '127.0.0.1';
  let port = 20000;
  let address = hostname + ':' + port

  let server = new Server(hostname, port);

  server.on('listening', () => { console.log(`Server listening at ${address}`); });
  server.on('error', (err: Error) => { console.log(`Server error: ${err}`); });
  server.on('close', (err: Error) => { console.log(`Server listening at ${address} closed: ${err}`); });
  server.on('shutdown', () => { console.log(`Server listening at ${address} shutdown`); });
  server.on('waiting', (group: PromiseGroup) => { console.log(`Waiting for ${group.Size()} connections...`); });
  server.on('wait', (res: Result[]) => { console.log(`Done!`); });

  server.on('connection', (socket: net.Socket) => {
    let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;

    console.log(`${address} Incoming connection from ${remoteAddress}`);

    return server.Serve(new Client(new JsonRpcCodec(socket), true))
      .catch((err: Error) => {
        console.error(`Conn ${remoteAddress} failed:\n` +
          `  ${err.name}: ${err.message}\n\n${err.stack}\n`);
      })
      .then(() => {
        socket.end();
        console.error(`Conn ${remoteAddress} ended`);
      })
  });

  server.Add('Add', (client: Client, args: any): Promise<any> => {
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(args.reduce((acc: number, current: number) => {
          return acc + current;
        }, 0));
      }, 2000);
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
