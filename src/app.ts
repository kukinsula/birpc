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
// * Fix WaitTimeout qui n'échoue pas quand le timeout est excédé
//
// * PromiseGroup:
//   * Constructor avec un Promise<any>[]
//   * Cancel a Wait
//
// * Client.Call(timeout)

function main() {
  let server = new Server();
  let address = server.Address();

  server.on('listening', () => { console.log(`Server listening at ${address}`); });
  server.on('error', (err: Error) => {
    console.log(`Server error: ${err}`);

    return server.Shutdown();
  });

  server.once('close', (err: Error) => {
    console.log(`Server listening at ${address} closed` +
      (err == undefined ? '' : `: ${err}`));
  });

  server.on('connection', (socket: net.Socket) => {
    let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;

    console.log(`${address} Incoming connection from ${remoteAddress}`);

    let client = new Client({
      codec: new JsonRpcCodec(socket),
      server: true,
      // timeout: 20000,
      keepALiveDelay: 10000
    });

    let done = (() => {
      client.Wait(5000)
        .then((res: Result[]) => {
          console.log(`${client.Prefix} waited for ${res.length} calls`);
        })
        .catch((err: Error) => {
          console.error(`${client.Prefix} ${err.name}: ${err.message}\n${err.stack}`);
        });
    });
    client.on('start', () => { console.log(`${client.Prefix} started bidirectional RPC!`); });
    client.on('receive', (msg: Message) => {
      console.log(`${client.Prefix} <- ${msg.toString()}`);
      client.Process(msg);
    });
    client.on('send', (msg: Message) => { console.log(`${client.Prefix} -> ${msg.toString()}`); });

    client.on('error', (err: Error) => {
      console.error(`${client.Prefix} ${err.name}: ${err.message}\n${err.stack}`);

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

    client.on('end', () => { console.log(`${client.Prefix} end!`); });

    server.Serve(client)
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

  process.once('SIGINT', () => {
    console.log('Exiting...');

    server.Wait(10000)
      .then((res: Result[]) => { console.log(`${address} waited for ${res.length} clients`); })
      .catch((err: Error) => { console.log(`${address} ${err.name}: ${err.message}\n${err.stack}`); });
  });
}

main();
