import * as net from 'net';

import { Server } from './server';
import { Client } from './client';
import { Message, Request } from './codec';
import { JsonRpcCodec } from './jsonrpc';
import { PromiseGroup, Result } from './promise';

// TODO:
//
// * Service prend en premier argument un sous type de Client:
//     Exec(client: <T extends Client>, ...)
//
// * Client: pour se débarasser des Promesses Start/Stop/handlemessage
//   utiliser l'EventEmitter (events: receive => client.Process(msg))
//
// * PromiseGroup:
//   * Constructor avec un Promise<any>[]
//   * Cancel a Wait
//
// * WaitTimeout: PromiseGroup => Server + Client
//
// * Server / Client: Config
//
// * Client.Call(timeout)

function main() {
  let hostname = '127.0.0.1';
  let port = 20000;
  let address = hostname + ':' + port

  let server = new Server(hostname, port);

  server.on('listening', () => { console.log(`Server listening at ${address}`); });
  server.on('error', (err: Error) => { console.log(`Server error: ${err}`); });
  server.on('shutdown', () => { console.log(`Server listening at ${address} shutdown`); });
  server.on('waiting', (group: PromiseGroup) => { console.log(`Waiting for ${group.Size()} connections...`); });
  server.on('wait', (res: Result[]) => { console.log(`Done!`); });

  server.once('close', (err: Error) => {
    console.log(`Server listening at ${address} closed` +
      (err == undefined ? '' : `: ${err}`));
  });

  server.on('connection', (socket: net.Socket) => {
    let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    let client = new Client({
      codec: new JsonRpcCodec(socket),
      server: true,
      timeout: 20000,
      keepALiveDelay: 10000
    });

    let done = (() => {
      client.Wait()
        .then((res: Result[]) => { })
        .catch((err: Error) => { });
    });

    let timer: NodeJS.Timer;

    console.log(`${address} Incoming connection from ${remoteAddress}`);

    client.on('start', () => { console.log(`${client.Prefix} started bidirectional RPC!`); });
    client.on('receive', (msg: Message) => { console.log(`${client.Prefix} <- ${msg.toString()}`); });
    client.on('send', (msg: Message) => { console.log(`${client.Prefix} -> ${msg.toString()}`); });

    client.on('error', (err: Error) => {
      console.error(`${client.Prefix} failed:\n` +
        `  ${err.name}: ${err.message}\n${err.stack}`);

      done();
    });

    client.on('service', (err: Error, req: Request) => {
      console.log(`${client.Prefix} Service '${req.method}' Exec failed: ` +
        `${err.name}: ${err.message}\n${err.stack}\n\n`);
    });

    client.once('timeout', () => {
      console.log(`${client.Prefix} timeout!`);
      done();
    });

    client.once('end', () => {
      clearInterval(timer);
      console.log(`${client.Prefix} ended!`);
    });

    return server.Serve(client)
  });

  server.Add('add', (client: Client, args: any): Promise<any> => {
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(args.reduce((acc: number, current: number) => {
          return acc + current;
        }, 0));
      }, 2000);
    });
  });

  server.Add('mult', (client: Client, args: any): Promise<any> => {
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
