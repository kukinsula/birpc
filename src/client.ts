import * as net from 'net';
import { Buffer } from 'buffer';

import { Codec, Message, Request, Response, RpcError } from './codec';
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

    this.prefix = (server ? 'Client* ' : 'Client ') + this.Address;
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      console.log(`${this.prefix} started bidirectional RPC!`);

      this.codec.on('data', (msg: Message) => {
        return this.handleMessage(msg)
          .then(() => { })
          .catch((err: Error) => { this.reject(err); });
      });
      this.codec.on('error', (err: Error) => { reject(err); });
      this.codec.on('end', () => { resolve(); });
    });
  }

  public Close(): void {
    this.codec.Close();
  }

  public Stop(): void {
    this.Close();
    this.resolve();
  }

  private handleMessage(msg: Message): Promise<void> {
    console.log(`${this.prefix} <- ${msg.toString()}`);

    if (msg.IsRequest()) return this.handleRequest(msg.req);
    else if (msg.IsResponse()) return this.handleResponse(msg.resp);
    else
      return this.reject(ClientError(
        'Invalid Message: it is neither a Request nor a Response'));
  }

  private handleRequest(req: Request): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.services.Exec(req.method, this, req.params)
        .then((res: any) => {
          if (req.id != undefined)
            return this.sendResponse(req.id, res);
        })
        .catch((err: Error) => {
          console.log(`${this.prefix} Service '${req.method}' Exec failed: ` +
            `${err.name}: ${err.message}\n${err.stack}`);

          if (req.id != undefined)
            return this.sendResponse(req.id, {
              code: 500,
              message: 'Server internal error',
              data: req
            });
        });
    });
  }

  private handleResponse(resp: Response): Promise<void> {
    let call = this.calls[resp.id];

    if (call == undefined)
      return this.reject(ClientError(`Call ${resp.id} not found`));

    delete this.calls[resp.id];

    if (resp.error == undefined)
      return call.Resolve(resp.result);

    return call.Reject({
      name: 'ClientResponse',
      message: resp.error.message
    });
  }

  private sendRequest(
    id: number | undefined, method: string, params?: any[]): Promise<void> {

    if (params != undefined) {
      let len = params.length;
      if (len == 0) params = undefined;
      else if (len == 1) params = params[0];
    }

    return this.send(new Message({
      id: id,
      method: method,
      params: params
    }));
  }

  private sendResponse(
    id: number, result?: any, err?: RpcError): Promise<void> {

    return this.send(new Message(undefined, {
      id: id,
      result: result,
      error: err
    }));
  }

  private send(msg: Message): Promise<void> {
    console.log(`${this.prefix} -> ${msg.toString()}`);

    return this.codec.Encode(msg);
  }

  public Call(name: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    return this.sendRequest(id, name, params)
      .then(() => { return call.Wait(); })
      .catch((err: Error) => {
        delete this.calls[id];

        return call.Reject(err);
      });
  }

  public Notify(name: string, ...params: any[]): Promise<void> {
    return this.sendRequest(undefined, name, params);
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

  public Wait(): Promise<any> {
    return this.promise;
  }

  public Resolve(res: any): Promise<void> {
    this.resolve(res);
    return this.promise;
  }

  public Reject(err: Error): Promise<void> {
    this.reject(err);
    return this.promise;
  }
}
