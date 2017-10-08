import * as net from 'net';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { ServerError } from './error';
import { JsonRpcCodec } from './jsonrpc';
import { PromiseGroup, Result } from './promise';

export type ConnHandler = (socket: net.Socket) => Promise<void>
export type ErrorHandler = (server: Server, err: Error) => Promise<void>

export class Server {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;
  private group: PromiseGroup;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.clients = {};
    this.server = new net.Server();
    this.services = new ServiceSet();
    this.group = new PromiseGroup();
  }

  public Start(handleConn: ConnHandler = this.handleConn): void {
    this.server.on('listening', () => {
      console.log(`Server listening at ${this.host}:${this.port}!`);
    });

    this.server.on('connection', (socket: net.Socket) => {
      let address = `${socket.remoteAddress}:${socket.remotePort}`;

      console.log(`Incoming connection from ${address}`);

      this.group.Add(handleConn.bind(this)(socket)
        .catch((err: Error) => {
          console.error(`Client ${address} failed:\n` +
            `  ${err.name}: ${err.message}\n\n${err.stack}\n`);
        })
        .then(() => {
          socket.end();
          console.log(`Connection ${address} ended`);
        }));

      // this.group.Add(handleConn.bind(this)(socket));
    });

    this.server.on('error', (err: any) => {
      console.error(`Server encountured  an error: ${err}`);
    });

    this.server.on('close', (err: any) => {
      if (err != undefined) console.log('Server close failed: ${err}');
      else console.log(`Server closed!`);
    });

    this.server.listen(this.port, this.host);
  }

  private handleConn(socket: net.Socket): Promise<void> {
    return this.Serve(new Client(
      new JsonRpcCodec(socket), this.services, true));
  }

  public Serve(client: Client): Promise<void> {
    this.register(client);

    return client.Start()
      .then(() => { this.unregister(client); return client.Wait(); })
      .then(() => { console.log(`Client ${client.GetPrefix()} connection closed!`); })
      .catch((err: Error) => {
        console.error(
          `Client ${client.GetPrefix()} failed:\n` +
          `  ${err.name}: ${err.message}\n\n${err.stack}\n`);
      })
      .then(() => { return client.Stop(); });
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close((err: any) => {
        if (err != undefined)
          return reject(ServerError(`${err}`));

        resolve();
      });
    });
  }

  public Shutdown(): Promise<void> {
    return this.Close()
      .then(() => {
        let addresses = Object.keys(this.clients);

        console.log(`Stoping ${addresses.length} clients...`);

        // TODO: utiliser un PromiseGroup(Promise<any>[]) pour
        // attendre toutes les promesses

        return Promise.all(addresses.map((address: string) => {
          this.unregister(this.clients[address]);
          return this.clients[address].Stop();
        }))
          .then(() => { console.log(`Stopped ${addresses.length} clients!`); });
      })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    return this.Close()
      .then(() => { return this.group.Wait(); })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  private register(client: Client): void {
    this.clients[client.Address] = client;
  }

  private unregister(client: Client): void {
    delete this.clients[client.Address];
  }

  public Add(name: string, service: Service): void {
    this.services.Add(name, service);
  }

  public Address(): string { return `${this.host}:${this.port}`; }
}
