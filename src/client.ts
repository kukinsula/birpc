import * as net from 'net';
import { Buffer } from 'buffer';

import { Codec, Message, Request, Response } from './codec';
import { ServiceSet } from './service';
import { ClientError, CodecError } from './error';

export class Client {
  private codec: Codec;
  private services: ServiceSet;
  private id: number;
  private calls: { [id: number]: Call };
  private resolve: any;
  private reject: any;
  private server: boolean;
  private prefix: string;
  public Address: string;

  constructor(codec: Codec, services?: ServiceSet, server: boolean = false) {
    this.codec = codec;
    this.services = services || new ServiceSet();
    this.id = 0;
    this.calls = {};
    this.server = server;

    let socket = codec.GetSocket();
    this.Address = server ?
      `${socket.remoteAddress}:${socket.remotePort}` :
      `${socket.localAddress}:${socket.localPort}`;

    this.prefix = (server ? `Client* ` : `Client `) + this.Address;
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      console.log(`${this.prefix} started bidirectional RPC!`);

      this.codec.on('data', this.handleMessage.bind(this));
      this.codec.on('error', (err: Error) => { reject(err); });
      this.codec.on('end', () => { resolve(); });
    });
  }

  public Close(): void { this.codec.Close(); }

  public Stop(): void {
    this.Close();
    this.resolve();
  }

  private handleMessage(msg: Message): void {
    console.log(`${this.prefix} <- ${msg.toString()}`);

    if (msg.IsRequest()) this.handleRequest(msg.req);
    else if (msg.IsResponse()) this.handleResponse(msg.resp);
    else this.reject(ClientError(
      'Received message is neither a Request nor a Response'));
  }

  private handleRequest(req: Request): void {
    this.services.Exec(req.method, this, req.params)
      .then((res: any) => {
        if (req.id != undefined)
          this.sendResponse({
            id: req.id,
            result: res
          });
      })
      .catch((err: Error) => {
        console.log(`${this.prefix} Service '${req.method}' Exec failed: ` +
          `${err.name}: ${err.message}\n${err.stack}`);

        if (req.id != undefined)
          this.sendResponse({
            id: req.id,
            error: {
              code: 500,
              message: 'Server internal error',
              data: req
            }
          });
      });
  }

  private handleResponse(resp: Response): void {
    let call = this.calls[resp.id];

    if (call == undefined)
      return this.reject(ClientError(`Call not found`));

    delete this.calls[resp.id];

    if (resp.error == undefined)
      call.Resolve(resp.result);
    else
      call.Reject({
        name: 'ClientResponse',
        message: resp.error.message
      });
  }

  private sendRequest(req: Request): void {
    if (req.params != undefined) {
      switch (req.params.length) {
        case 0: req.params = undefined; break;
        case 1: req.params = req.params[0]; break;
      }
    }

    this.send(new Message(req));
  }

  private sendResponse(resp: Response): void {
    this.send(new Message(undefined, resp));
  }

  private send(msg: Message): void {
    console.log(`${this.prefix} -> ${msg.toString()}`);

    this.codec.Encode(msg);
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

  public GetPrefix(): string { return this.prefix; }
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
