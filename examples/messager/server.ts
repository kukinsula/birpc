import * as net from 'net';

import * as birpc from '../../src/birpc';

class Room {
  public name: string
  private clients: birpc.Client[]

  constructor(name: string) {
    this.name = name;
    this.clients = [];
  }

  public Add(client: birpc.Client): void {
    this.clients.push(client);
  }

  public Broadcast(from: birpc.Client, params: any): Promise<void> {
    return Promise.all(this.clients.map((client: birpc.Client) => {
      if (from.Address == client.Address)
        return Promise.resolve();

      params.from = from.Address;

      return client.Notify('message', params)
        .then(() => { })
        .catch((err: any) => { throw err; });
    }))
      .then(() => { })
      .catch((err: any) => { throw err; });
  }
}

export class Server extends birpc.Server {
  private calls: number;
  private rooms: { [name: string]: Room }

  constructor() {
    super();

    this.calls = 0;
    this.rooms = {
      'test': new Room('test')
    };

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

      let client = new birpc.Client({
        codec: new birpc.JsonRpcCodec(socket),
        server: true,
        // timeout: 20000,
        keepAliveDelay: 20000
      });

      client.on('receive', (msg: birpc.Message) => {
        console.log(`${client.Prefix} <- ${msg.toString()}`);
      });

      client.on('send', (msg: birpc.Message) => {
        console.log(`${client.Prefix} -> ${msg.toString()}`);
      });

      this.Serve(client);

      this.rooms['test'].Add(client);

      if (this.Size() % 100 == 0)
        console.log(`Server ${this.Address()}: hosts ${this.Size()} clients`);
    });

    this.Handle('add', (client: birpc.Client, args: any): Promise<any> => {
      this.incCalls();

      return new Promise<any>((resolve, reject) => {
        let sleep = 100 + Math.floor(Math.random() * Math.floor(1000));

        setTimeout(() => {
          resolve({
            a: {
              a: 123456789,
              b: 123456789,
              c: 123456789,
              d: 123456789
            },
            b: {
              a: 123456789,
              b: 123456789,
              c: 123456789,
              d: 123456789
            },
            c: {
              a: 123456789,
              b: 123456789,
              c: 123456789,
              d: 123456789
            },
            d: {
              a: 123456789,
              b: 123456789,
              c: 123456789,
              d: 123456789
            }
          });
        }, sleep);
      });
    });

    this.Handle('mult', (client: birpc.Client, args: any): Promise<any> => {
      this.incCalls();

      return Promise.resolve(args.reduce((acc: number, current: number) => {
        return acc * current;
      }, 1));
    });

    this.Handle('message', (client: birpc.Client, args: any): Promise<any> => {
      args.from = client.Address;

      if (args.to != undefined) {
        let recipient = this.GetClient(args.to);

        if (recipient == undefined)
          throw new Error(`Server: client ${args.to} doesn't exist`);

        return recipient.Notify('message', args)
          .then(() => { return { ok: true }; })
          .catch((err: any) => { throw err; });
      }

      else if (args.room != undefined) {
        let room = this.rooms[args.room];

        if (room == undefined)
          throw new Error(`Server: room ${args.room} doesn't exist`);

        return room.Broadcast(client, args)
          .then(() => { return { ok: true }; })
          .catch((err: any) => { throw err; });
      }

      throw new Error(`Server: invalid message RPC call`);
    });
  }

  private incCalls(): void {
    this.calls++;

    if (this.calls % 1000 == 0)
      console.log(`Server ${this.Address()}: ${this.calls} calls made`);
  }
}
