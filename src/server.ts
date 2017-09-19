import * as net from 'net';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { ServerError } from './error';
import { JsonRpcCodec } from './jsonrpc';

export class Server {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.server = new net.Server();
    this.services = new ServiceSet();
    this.clients = {};
  }

  public Start(): void {
    this.server.on('listening', () => {
      console.log(`Server listening at ${this.host}:${this.port}!`);
    });

    this.server.on('connection', (socket: net.Socket) => {
      let client = new Client(new JsonRpcCodec(socket), this.services);

      this.register(client);

      client.Start()
        .catch((err: Error) => {
          console.log(`Client ${client.Address} ${err}`);
        })
        .then(() => {
          console.log(`Client ${client.Address} connection ended`);

          client.Close();
          this.unregister(client);
        });
    });

    this.server.on('error', (err: any) => {
      console.log(`Server encountured  an error: ${err}`);
    });

    this.server.on('close', (err: any) => {
      console.log(`Server closed!`);
    });

    this.server.listen(this.port, this.host);
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log(`Server ${this.Address()} closing listener...`);

      this.server.close((err: any) => {
        if (err != undefined) reject(ServerError(`${err}`));

        console.log(`Server ${this.Address()} listener closed!`);

        this.closeAllClients();

        resolve();
      });
    });
  }

  private closeAllClients(): void {
    console.log(`Closing all clients...`);

    let addresses = Object.keys(this.clients);

    addresses.forEach((address: string) => {
      this.clients[address].Close();
      this.unregister(this.clients[address]);
    });

    console.log(`Closed ${addresses.length} clients!`);
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
