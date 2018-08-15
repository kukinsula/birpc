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
    console.log('');

    return Promise.all(this.clients.map((client: birpc.Client) => {
      if (from.Address == client.Address)
        return Promise.resolve({ result: undefined, error: undefined });

      params.from = from.Address;

      return client.Notify('message', params)
        .then((result: any) => { return { result: result, error: undefined }; })
        .catch((err: any) => { return { result: undefined, error: err }; });
    }))
      .then((results: any[]) => { })
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

    this.on('listening', () => { console.log(`${this.Prefix} listening`); });
    this.on('error', (err: Error) => {
      console.log(`Server error: ${err}`);

      this.Shutdown()
        .then(() => { })
        .catch((err: Error) => { });
    });

    this.once('close', (err: Error) => {
      console.log(`${this.Prefix} closed` + (err == undefined ?
        '' : `: ${err.name}: ${err.message}\n${err.stack}`));
    });

    this.on('connection', (socket: net.Socket) => {
      let remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      let client = new birpc.Client({
        socket: socket,
        codec: new birpc.JsonRpcCodec(),
        server: true,
        // timeout: 20000,
        keepAliveDelay: 20000
      });

      console.log(`${client.Prefix} incoming connection`)

      client.on('receive', (msg: birpc.Message) => {
        console.log(`${client.Prefix} <- ${msg.toString()}`);
      });

      client.on('send', (msg: birpc.Message) => {
        console.log(`${client.Prefix} -> ${msg.toString()}`);
      });

      client.on('error', (err: any) => {
        console.log(`${client.Prefix} error: ${err}`);

        client.Stop();
      });

      client.on('close', () => {
        console.log(`${client.Prefix} connection closed`)
      });

      this.Serve(client);

      this.rooms['test'].Add(client);

      if (this.Size() % 100 == 0)
        console.log(`Server ${this.Prefix}: hosts ${this.Size()} clients`);
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

        return recipient.Call('message', args)
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

    this.Handle('ping', (client: birpc.Client, args: any): Promise<any> => {
      if (args == 'stop')
        return Promise.resolve('stop');

      return client.Call('pong')
        .then(() => { return 'pong'; })
        .catch((err: any) => { throw err; });
    });
  }

  private incCalls(): void {
    this.calls++;

    if (this.calls % 1000 == 0)
      console.log(`Server ${this.Prefix}: ${this.calls} calls made`);
  }
}
