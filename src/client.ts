import * as net from 'net';
import { Buffer } from 'buffer';

import { Codec, Message, Request, Response, RpcError } from './codec';
import { ClientError, CodecError, CanceledCallError } from './error';
import { ServiceSet } from './service';

export class Client {
  private codec: Codec;
  private services: ServiceSet;
  private id: number;
  private calls: { [id: number]: Call };
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
      console.log(`${this.prefix} started bidirectional RPC!`);

      this.codec.on('data', (msg: Message) => {
        this.handleMessage(msg)
          .then(() => { })
          .catch((err: Error) => { reject(err); });
      });

      this.codec.on('error', (err: Error) => {
        this.cancelPendingCalls()
          .then(() => { reject(err); })
          .catch((err: Error) => { reject(err); });
      });

      this.codec.on('end', () => {
        this.cancelPendingCalls()
          .then(() => { resolve(); })
          .catch((err: Error) => { reject(err); });
      });
    });
  }

  private handleMessage(msg: Message): Promise<boolean> {
    console.log(`${this.prefix} <- ${msg.toString()}`);

    let promise = Promise.resolve(true);

    if (msg.IsRequest()) promise = this.handleRequest(msg.req);
    else if (msg.IsResponse()) promise = this.handleResponse(msg.resp);
    else {
      return Promise.reject(ClientError(
        'Invalid Message: it is neither a Request nor a Response'));
    }

    return promise;
  }

  private handleRequest(req: Request): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let done = ((body: any) => {
        if (req.id == undefined) { // if Notification
          resolve(false);
          return false;
        }

        return this.sendResponse(req.id, body)
          .then((flushed: boolean) => { resolve(flushed); return flushed; })
          .catch((err: Error) => { reject(err); });
      });

      return this.services.Exec(req.method, this, req.params)
        .then((res: any) => { return done(res); })
        .catch((err: Error) => {
          console.log(`${this.prefix} Service '${req.method}' Exec failed: ` +
            `${err.name}: ${err.message}\n${err.stack}\n`);

          return done({
            code: 500,
            message: 'Server internal error',
            data: err
          });
        });
    });
  }

  private handleResponse(resp: Response): Promise<boolean> {
    let call = this.calls[resp.id];

    if (call == undefined)
      return Promise.reject(ClientError(`Call ${resp.id} not found`));

    delete this.calls[resp.id];

    if (resp.error == undefined) {
      call.Resolve(resp.result);
      return Promise.resolve(false);
    }

    call.Reject({
      name: 'ClientResponse',
      message: resp.error.message
    });

    return Promise.resolve(true);
  }

  private sendRequest(
    id: number | undefined, method: string, params?: any[]): Promise<boolean> {

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
    id: number, result?: any, err?: RpcError): Promise<boolean> {

    return this.send(new Message(undefined, {
      id: id,
      result: result,
      error: err
    }));
  }

  private send(msg: Message): Promise<boolean> {
    console.log(`${this.prefix} -> ${msg.toString()}`);

    return this.codec.Encode(msg);
  }

  public Call(method: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    return this.sendRequest(id, method, params)
      .then(() => { return call.Wait(); })
      .catch((err: Error) => {
        delete this.calls[id];

        return call.Reject(err);
      });
  }

  public Notify(method: string, ...params: any[]): Promise<boolean> {
    return this.sendRequest(undefined, method, params);
  }

  public GetPrefix(): string { return this.prefix; }


  public Close(): void {
    this.codec.Close();
  }

  private cancelPendingCalls(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let calls: Call[] = [];

      for (let id in this.calls)
        if (this.calls.hasOwnProperty(id))
          calls.push(this.calls[id]);

      return Promise.all(calls.map((call: Call) => {
        return call.Reject(CanceledCallError('Call was canceled'));
      }))
        .then(() => { resolve(); })
        .catch((err: Error) => { reject(err); });
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
