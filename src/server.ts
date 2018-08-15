import * as net from 'net';
import { EventEmitter } from 'events';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { PromiseGroup, Result } from './promise';

require('source-map-support').install();

export interface ServerConfig {
  host?: string;
  port?: number;
  services?: ServiceSet
}

export class Server extends EventEmitter {
  private host: string;
  private port: number;
  private server: net.Server;
  private clients: { [address: string]: Client };
  private services: ServiceSet;
  public Address: string;
  public Prefix: string;

  constructor(config: ServerConfig = {}) {
    super();

    this.host = config.host || '127.0.0.1';
    this.port = config.port || 20000;
    this.clients = {};
    this.server = new net.Server();
    this.services = config.services || new ServiceSet();
    this.Address = `${this.host}:${this.port}`;
    this.Prefix = `Server ${this.Address}`;
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.on('listening', () => {
        this.emit('listening');

        resolve();
      });

      this.server.on('close', () => { this.emit('close'); });
      this.server.on('error', (err: Error) => { this.emit('error', err); });

      this.server.on('connection', (socket: net.Socket) => {
        socket.on('end', () => {
          let address = `${socket.remoteAddress}:${socket.remotePort}`;

          this.unregister(address);
        });

        this.emit('connection', socket);
      });

      this.server.listen(this.port, this.host);
    });
  }

  public Serve(client: Client): void {
    client.services = this.services;
    this.register(client);

    client.Start();
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.on('close', () => {
        resolve();
      });

      this.server.close((err: any) => {
        if (err != undefined)
          reject(err);
      });
    });
  }

  // TODO: tester le Shutdown avec timeout !
  public Shutdown(timeout?: number): Promise<void> {
    let group = new PromiseGroup(
      Object.keys(this.clients).map((address: string) => {
        return this.clients[address].Stop();
      }));

    return this.Close()
      .then(() => { return group.Wait(timeout); })
      .then(() => { })
      .catch((err: Error) => { throw err; });
  }

  private register(client: Client): void {
    this.clients[client.Address] = client;
  }

  private unregister(address: string): void {
    delete this.clients[address];
  }

  public GetClient(address: string): Client {
    return this.clients[address];
  }

  public Handle(name: string, service: Service): void {
    this.services.Add(name, service);
  }

  public Size(): number {
    return Object.keys(this.clients).length;
  }
}
