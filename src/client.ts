import * as net from 'net';
import { Buffer } from 'buffer';

import { Codec, Message, Request, Response } from './codec';
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
    let message: Message;

    try { message = this.codec.Decode(buf.toString()); } catch (err) {
      return reject(CodecError(err));
    }

    console.log(`${this.Address()} -> ${message.toString()}`);

    if (message.IsRequest()) {
      let req = message.req;

      this.services.Exec(req.method, this, req.params)
        .then((res: any) => {
          if (req.id != undefined)
            this.sendResponse({ id: req.id, result: res });
        })
        .catch((err: Error) => {
          console.log(`Service '${req.method}' Exec failed: ${err.stack}`);

          if (req.id != undefined)
            this.sendResponse({
              id: req.id,
              error: {
                code: 500,
                message: 'Server internal error',
                data: req.params
              }
            });
        });
    } else if (message.IsResponse()) {
      let resp = message.resp;
      let call = this.calls[resp.id];

      if (call == undefined)
        return reject(ClientError(`Call not found`));

      if (resp.error == undefined)
        call.Resolve(resp.result);
      else
        call.Reject({
          name: 'ClientResponse',
          message: resp.error.message
        });
    } else {
      reject(ClientError(
        'Received message is neither a Request nor a Response'));
    }
  }

  public Close(): void { this.socket.end(); }

  private sendRequest(req: Request): void {
    this.send(new Message(req));
  }

  private sendResponse(resp: Response): void {
    this.send(new Message(undefined, resp));
  }

  private send(msg: Message): void {
    console.log(`${this.Address()} <- ${msg.toString()}`);

    this.socket.write(this.codec.Encode(msg), 'UTF8');
  }

  public Call(name: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    this.sendRequest({
      id: id,
      method: name,
      params: params
    });

    return call.Wait();
  }

  public Notify(name: string, ...params: any[]): void {
    this.sendRequest({
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
  public Resolve(res: any): void { this.resolve(res); }
  public Reject(err: Error): void { this.reject(err); }
}
