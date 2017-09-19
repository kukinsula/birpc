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
  public Address: string;

  constructor(codec: Codec, services?: ServiceSet) {
    this.codec = codec;
    this.services = services || new ServiceSet();
    this.id = 0;
    this.calls = {};

    let socket = codec.GetSocket();
    this.Address = `${socket.remoteAddress}:${socket.remotePort}`;
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      console.log(`Incoming connection from ${this.Address}`);

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
    console.log(`${this.Address} -> ${msg.toString()}`);

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
        console.log(`Service '${req.method}' Exec failed: ` +
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
    req.params = req.params.length == 1 ? req.params[0] : req.params;

    let msg = new Message(req);

    console.log(`${this.Address} -> ${msg.toString()}`);

    this.codec.Encode(msg);
  }

  private sendResponse(resp: Response): void {
    let msg = new Message(undefined, resp);

    console.log(`${this.Address} <- ${msg.toString()}`);

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
