import * as net from 'net';
import { EventEmitter } from 'events';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { ServerError } from './error';
import { Codec } from './codec';
import { JsonRpcCodec } from './jsonrpc';
import { PromiseGroup, Result } from './promise';

export type ConnHandler = (socket: net.Socket) => Promise<void>
export type ErrorHandler = (server: Server, err: Error) => Promise<void>

export class Server extends EventEmitter {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;
  private group: PromiseGroup;

  constructor(host: string, port: number) {
    super();

    this.host = host;
    this.port = port;
    this.clients = {};
    this.server = new net.Server();
    this.services = new ServiceSet();
    this.group = new PromiseGroup();
  }

  public Start(): void {
    this.server.on('listening', () => { this.emit('listening'); });
    this.server.on('error', (err: any) => {
      this.emit('error', err == undefined ? undefined : ServerError(err));
    });
    this.server.on('close', (err: any) => {
      this.emit('close', err == undefined ? undefined : ServerError(err));
    });

    this.server.on('connection', (socket: net.Socket) => {
      this.emit('connection', socket);
    });

    this.server.listen(this.port, this.host);
  }

  public Serve(client: Client): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      client.SetServices(this.services);

      this.register(client);

      let done = ((err?: Error) => {
        return client.Wait()
          .then((res: Result[]) => {
            this.unregister(client);

            if (err != undefined)
              return reject(err);

            resolve(client);
          })
          .catch((err: Error) => {
            this.unregister(client);
            reject(err);
          });
      });

      client.Start()
        .then(() => { done(); })
        .catch((err: Error) => { done(err); });
    });
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close((err: any) => {
        if (err != undefined) {
          this.emit('close', ServerError(err));
          return reject(ServerError(`${err}`));
        }

        this.emit('close');
        resolve();
      });
    });
  }

  public Shutdown(): Promise<void> {
    return this.Close()
      .then(() => {
        let addresses = Object.keys(this.clients);

        // TODO: utiliser un PromiseGroup(Promise<any>[]) pour
        // attendre toutes les promesses

        return Promise.all(addresses.map((address: string) => {
          this.unregister(this.clients[address]);
          return this.clients[address].Stop();
        }))
          .then(() => { this.emit('shutdown'); });
      })
      .catch((err: Error) => {
        this.emit('error', err);
        return Promise.reject(err);
      });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    return this.Close()
      .then(() => {
        this.emit('waiting', this.group);
        return this.group.Wait();
      })
      .then((res: Result[]) => {
        this.emit('wait', res);
        return res;
      })
      .catch((err: Error) => {
        this.emit('error', err);
        return Promise.reject(err);
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
