import * as net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

import { Codec, Message, Request, Response, RpcError } from './codec';
import { ClientError, CodecError } from './error';
import { ServiceSet } from './service';
import { PromiseGroup, Result } from './promise';

export interface ClientConfig {
  codec: Codec
  server?: boolean
  services?: ServiceSet
  timeout?: number
  keepALiveDelay?: number
}

export class Client extends EventEmitter {
  private codec: Codec;
  private services: ServiceSet;
  private id: number;
  private calls: { [id: number]: Call };
  private server: boolean;
  private group: PromiseGroup;
  private resolve: any;
  private reject: any;
  public Address: string;
  public Prefix: string;

  constructor(config: ClientConfig) {
    super();

    this.codec = config.codec;
    this.services = config.services || new ServiceSet();
    this.id = 0;
    this.calls = {};
    this.server = config.server || false;
    this.group = new PromiseGroup();

    let socket = this.codec.GetSocket();
    this.Address = this.server ?
      `${socket.remoteAddress}:${socket.remotePort}` :
      `${socket.localAddress}:${socket.localPort}`;

    this.Prefix = (this.server ? 'Client* ' : 'Client ') + this.Address;

    if (config.timeout != undefined) {
      socket.setTimeout(config.timeout);
      socket.on('timeout', () => { this.emit('timeout') });
    }

    if (config.keepALiveDelay != undefined)
      socket.setKeepAlive(true, config.keepALiveDelay)
  }

  public Start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.resolve = reject;

      this.codec.on('data', (msg: Message) => {
        this.handleMessage(msg)
          .then(() => { })
          .catch((err: Error) => { this.emit('error', err); reject(err); });
      });

      this.codec.on('error', (err: Error) => {
        this.emit('error', err);

        this.cancelPendingCalls()
          .then(() => { reject(err); })
          .catch((err: Error) => { reject(err); });
      });

      this.codec.on('end', () => {
        this.emit('end');

        this.cancelPendingCalls()
          .then(() => { resolve(); })
          .catch((err: Error) => { reject(err); });
      });

      this.emit('start');
    });
  }

  private handleMessage(msg: Message): Promise<boolean> {
    this.emit('receive', msg);

    let promise = Promise.resolve(true);

    if (msg.IsRequest()) promise = this.handleRequest(msg.req);
    else if (msg.IsResponse()) promise = this.handleResponse(msg.resp);
    else
      return Promise.reject(ClientError(
        'invalid Message: neither a Request nor a Response'));

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
          this.emit('service', err, req);

          return done({
            code: 500,
            message: 'Server internal error',
            data: req
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

  private sendRequest(id: number | undefined, method: string, params?: any[])
    : Promise<boolean> {

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

  private sendResponse(id: number, result?: any, err?: RpcError)
    : Promise<boolean> {

    return this.send(new Message(undefined, {
      id: id,
      result: result,
      error: err
    }));
  }

  private send(msg: Message): Promise<boolean> {
    return this.codec.Encode(msg)
      .then((flushed: boolean) => { this.emit('send', msg); return flushed; })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  public Call(method: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    return this.sendRequest(id, method, params)
      .then(() => {
        let promise = call.Wait()
          .then((res: any) => { delete this.calls[id]; return res; })
          .catch((err: Error) => {
            delete this.calls[id];
            return Promise.reject(err);
          });

        this.group.Add(promise);

        return promise;
      })
      .catch((err: Error) => { delete this.calls[id]; return call.Reject(err); });
  }

  public Notify(method: string, ...params: any[]): Promise<boolean> {
    return this.sendRequest(undefined, method, params);
  }

  public Stop(): Promise<void> {
    return this.codec.Close()
      .then(() => { this.resolve(); this.emit('stop'); })
      .catch((err: Error) => { this.reject(err); return Promise.reject(err); });
  }

  public Wait(): Promise<Result[]> {
    this.emit('waiting');

    return this.Stop()
      .then(() => {
        return this.group.Wait()
          .then((res: Result[]) => { this.emit('wait', res); return res; })
          .catch((err: Error) => { return Promise.reject(err); });
      })
      .catch((err: Error) => { return Promise.reject(err); });
  }

  private cancelPendingCalls(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let calls: Call[] = [];

      for (let id in this.calls)
        if (this.calls.hasOwnProperty(id))
          calls.push(this.calls[id]);

      return Promise.all(calls.map((call: Call) => {
        return call.Reject(ClientError('Call was canceled'));
      }))
        .then(() => { resolve(); })
        .catch((err: Error) => { reject(err); });
    });
  }

  public SetServices(services: ServiceSet): void {
    this.services = services;
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
