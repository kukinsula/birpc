import * as net from 'net';

import { EventEmitter } from 'events';

import { Client } from './client';
import { ServiceSet, Service } from './service';
import { ServerError } from './error';
import { Codec } from './codec';
import { JsonRpcCodec } from './jsonrpc';
import { PromiseGroup, Result } from './promise';

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

  constructor(config: ServerConfig = {}) {
    super();

    this.host = config.host || '127.0.0.1';
    this.port = config.port || 20000;
    this.clients = {};
    this.server = new net.Server();
    this.services = config.services || new ServiceSet();
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
      socket.on('end', () => {
        this.unregister(`${socket.remoteAddress}:${socket.remotePort}`);
      });
      this.emit('connection', socket);
    });

    this.server.listen(this.port, this.host);
  }

  public Serve(client: Client): void {
    client.SetServices(this.services);
    this.register(client.Address, client);
    client.Start();
  }

  public Close(): void {
    this.server.close();
  }

  public Shutdown(timeout?: number): Promise<void> {
    this.Close()

    let group = new PromiseGroup(Object.keys(this.clients)
      .map((address: string) => {
        return this.clients[address].Stop();
      }));

    return group.Wait(timeout)
      .then((res: Result[]) => { })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  private register(address: string, client: Client): void {
    this.clients[address] = client;
  }

  private unregister(address: string): void {
    delete this.clients[address];
  }

  public Add(name: string, service: Service): void {
    this.services.Add(name, service);
  }

  public Address(): string { return `${this.host}:${this.port}`; }
}
