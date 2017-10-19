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

export interface ServerConfig {
  host: string;
  port: number;
  services?: ServiceSet;
}

export class Server extends EventEmitter {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;
  private group: PromiseGroup;

  constructor(config?: ServerConfig) {
    super();

    if (config == undefined)
      config = {
        host: '127.0.0.1',
        port: 20000,
        services: new ServiceSet()
      };

    this.host = config.host;
    this.port = config.port;
    this.clients = {};
    this.server = new net.Server();
    this.services = config.services || new ServiceSet();
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

  public Serve(client: Client): void {
    client.SetServices(this.services);
    this.register(client);
    client.Start();
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close((err: any) => {
        if (err != undefined) return reject(ServerError(`${err}`));

        resolve();
      });
    });
  }

  public Shutdown(timeout?: number): Promise<void> {
    return this.Close()
      .then(() => {
        let addresses = Object.keys(this.clients);

        // TODO: utiliser un PromiseGroup(Promise<any>[]) pour
        // attendre toutes les promesses

        return Promise.all(addresses.map((address: string) => {
          this.unregister(this.clients[address]);
          return this.clients[address].Wait(timeout);
        }))
          .then(() => { })
          .catch((err: Error) => { return Promise.reject(err); });
      })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    return this.Close()
      .then(() => { console.log('ICICICICICI'); return this.group.Wait(timeout); })
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
