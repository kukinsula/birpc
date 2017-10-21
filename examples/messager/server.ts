import * as net from 'net';

import * as birpc from '../../src/birpc';

import { Client } from './client';

export class Server extends birpc.Server {
  constructor() {
    super();

    let address = this.Address();

    this.on('listening', () => { console.log(`Server listening at ${address}`); });
    this.on('error', (err: Error) => {
      console.log(`Server error: ${err}`);

      this.Shutdown()
        .then(() => { })
        .catch((err: Error) => { });
    });

    this.once('close', (err: Error) => {
      console.log(`Server listening at ${address} closed` +
        (err == undefined ?
          '' : `: ${err.name}: ${err.message}\n${err.stack}`));
    });

    this.on('connection', (socket: net.Socket) => {
      let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`${address} Incoming connection from ${remoteAddress}`)

      this.Serve(new Client({
        codec: new birpc.JsonRpcCodec(socket),
        server: true,
        // timeout: 20000,
        keepALiveDelay: 20000
      }));
    });

    this.Add('add', (client: Client, args: any): Promise<any> => {
      return new Promise<number>((resolve, reject) => {
        setTimeout(() => {
          resolve(args.reduce((acc: number, current: number) => {
            return acc + current;
          }, 0));
        }, 2000);
      });
    });

    this.Add('mult', (client: Client, args: any): Promise<any> => {
      return Promise.resolve(args.reduce((acc: number, current: number) => {
        return acc * current;
      }, 1));
    });
  }
}
