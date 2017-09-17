import * as net from 'net';
import { Buffer } from 'buffer';

import { Codec } from './codec';
import { ServiceSet } from './service';
import { ClientError, CodecError } from './error';

export class Client {
  private socket: net.Socket;
  private codec: Codec;
  private services: ServiceSet;
  private id: number;
  private calls: { [id: number]: Call };

  constructor(socket: net.Socket, codec: Codec, services?: ServiceSet) {
    this.socket = socket;
    this.codec = codec;
    this.services = services || new ServiceSet();
    this.id = 0;
    this.calls = {};
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log(`Incoming connection from ${this.Address()}`);

      this.socket.on('data', (buf: Buffer) => { this.handleData(buf, reject); });
      this.socket.on('error', (err: any) => { reject(ClientError(err)); });
      this.socket.on('end', () => { resolve(); });
    });
  }

  private handleData(buf: Buffer, reject: any): void {
    let message: any;

    try { message = this.codec.Decode(buf.toString()); } catch (err) {
      return reject(CodecError(err));
    }

    console.log(`${this.Address()} -> ${JSON.stringify(message)}`);

    if (message.id % 2 == 0) {
      this.services.Exec(message.method, message.params)
        .then((res: any) => {
          this.send({ id: message.id, result: res });
        })
        .catch((err: Error) => {
          this.send({
            id: message.id,
            error: {
              code: 500,
              message: err.message,
              data: {}
            }
          });
        });
    } else {
      let call = this.calls[message.id];
      if (call == undefined) {
        return reject(ClientError(`Response Call not found`));
      }

      console.log(`${this.Address()} <- ${JSON.stringify(message)}`);

      if (message.error == undefined) call.Then(message.result);
      else call.Catch(message.error);
    }
  }

  public Close(): void { this.socket.end(); }

  private send(v: any): void {
    console.log(`${this.Address()} <- ${JSON.stringify(v)}`);

    this.socket.write(this.codec.Encode(v), 'UTF8');
  }

  public Go(name: string, ...params: any[]): Call {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    this.send({
      id: id,
      method: name,
      params: params
    });

    return call;
  }

  public Call(name: string, ...params: any[]): Promise<any> {
    return this.Go(name, params).Wait();
  }

  public Notify(name: string, ...params: any[]): void {
    this.send({
      method: name,
      params: params
    });
  }

  public Address(): string {
    return `${this.socket.remoteAddress}:${this.socket.remotePort}`;
  }
}

export class Call {
  private promise: Promise<any>;
  private resolve: any;
  private reject: any;

  constructor() {
    this.promise = new Promise<any>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  public Wait(): Promise<any> { return this.promise; }
  public Then(res: any): void { this.resolve(res); }
  public Catch(err: Error): void { this.reject(err); }
}
