import * as net from 'net';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { ServerError } from './error';
import { JsonRpcCodec } from './jsonrpc';

export type ConnHandler = (socket: net.Socket) => Promise<void>
export type ErrorHandler = (server: Server, err: Error) => Promise<void>

export class Server {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;

  // TODO: PromiseGroup

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.server = new net.Server();
    this.services = new ServiceSet();
    this.clients = {};
  }

  public Start(handleConn: ConnHandler = this.handleConn): void {
    this.server.on('listening', () => {
      console.log(`Server listening at ${this.host}:${this.port}!`);
    });

    this.server.on('connection', handleConn.bind(this));

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
    let client = new Client(new JsonRpcCodec(socket), this.services, true);

    this.register(client);

    return client.Start()
      .catch((err: Error) => {
        console.error(
          `Client ${client.GetPrefix()} failed:\n` +
          `  ${err.name}: ${err.message}\n\n${err.stack}`);
      })
      .then(() => {
        console.log(`Client ${client.GetPrefix()} connection ended`);

        client.Close();
        this.unregister(client);
      });
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log(`Closing Server listening at ${this.Address()}...`);

      this.server.close((err: any) => {
        if (err != undefined)
          return reject(ServerError(`${err}`));

        console.log(`Server listening at ${this.Address()} closed!`);

        resolve();
      });
    });
  }

  public Shutdown(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      return this.Close()
        .then(() => {
          let addresses = Object.keys(this.clients);

          console.log(`Stoping ${addresses.length} clients...`);

          addresses.forEach((address: string) => {
            this.clients[address].Stop();
            this.unregister(this.clients[address]);
          });

          console.log(`Closed ${addresses.length} clients!`);

          resolve();
        })
        .catch((err: Error) => { reject(err); });
    });
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
