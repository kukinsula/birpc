import * as net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

import { Codec, Message, Request, Response, RpcError } from './codec';
import { ClientError, CodecError, ServiceError, CallError } from './error';
import { ServiceSet, Service } from './service';
import { PromiseGroup, Result } from './promise';

const
  es = require('event-stream'),
  JSONStream = require('JSONStream');

export interface ClientConfig {
  codec: Codec
  server?: boolean
  services?: ServiceSet
  timeout?: number
  keepAliveDelay?: number
}

export class Client extends EventEmitter {
  private codec: Codec;
  public services: ServiceSet;
  private id: number;
  private calls: { [id: number]: Call };
  private server: boolean;
  private group: PromiseGroup;
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

    if (config.keepAliveDelay != undefined)
      socket.setKeepAlive(true, config.keepAliveDelay)
  }

  public Start(): void {
    let socket = this.codec.GetSocket();

    socket
      // JSON Codec's Decode
      .pipe(JSONStream.parse())
      .on('error', (err: any) => { console.log('JSONStream.parse', err); this.Stop(); })

      .pipe(es.map((data: any, done: (err?: null | any, data?: null | any) => void) => {
        let msg = new Message();

        // console.log('DATA', data);

        if (data.method != undefined && data.method != '') {
          msg.req = {
            id: data.id,
            method: data.method,
            params: data.params
          };
        }

        else if (data.result != undefined || data.error != undefined) {
          msg.resp = {
            id: data.id,
            result: data.result,
            error: data.error
          };
        }

        else
          done(new Error('JSON RPC Codec invalid Message'));

        this.emit('receive', msg);

        done(null, msg);
      }))
      .on('error', (err: any) => { console.log('JSON Request or Response', err); this.Stop(); })

      // Process of the RPC Request or the RPC Response
      .pipe(es.map((msg: Message, done: (err?: null | any, data?: null | any) => void) => {
        // console.log('MSG', msg);

        if (msg.IsRequest() && msg.req != undefined)
          return this.processRequest(msg.req)
            .then((data: any) => {
              // Notifications
              if (msg.req != undefined && msg.req.id == undefined)
                return done()

              done(null, {
                id: msg.req == undefined ? undefined : msg.req.id,
                result: data
              });
            })
            .catch((err: any) => {
              done(null, {
                id: msg.req == undefined ? undefined : msg.req.id,
                error: err
              });
            });

        else if (msg.IsResponse() && msg.resp != undefined) {
          this.processResponse(msg.resp);

          return done();
        }

        else
          return done(new Error('invalid Message: neither a Request nor a Response'));
      }))
      .on('error', (err: any) => { console.log('Process RPC Message', err); this.Stop(); })

      .pipe(es.mapSync((msg: Message) => { return msg.resp; }))

      // JSON Codec's Encode
      .pipe(JSONStream.stringify('', '', ''))
      .on('error', (err: any) => { console.log('JSONStream.stringify', err); this.Stop(); })

      .pipe(socket)
      .on('error', (err: any) => { console.log('SOCKET', err); this.Stop(); });
  }

  private processRequest(req: Request): Promise<any> {
    return this.services.Exec(req.method, this, req.params)
      .then((result: any) => {
        return {
          id: req.id,
          result: result
        };
      })
      .catch((err: any) => {
        return {
          code: 500,
          message: 'Server internal error',
          data: req
        };
      });
  }

  private processResponse(resp: Response): void {
    let call = this.calls[resp.id];

    if (call == undefined)
      throw new Error(`Call ${resp.id} not found`);

    delete this.calls[resp.id];

    if (resp.error == undefined)
      call.Resolve(resp.result);

    else
      call.Reject({
        name: 'ClientResponse',
        message: resp.error.message
      });
  }

  // public Process(messages: Message[]): Promise<boolean[]> {
  //   return messages.reduce((acc: Promise<boolean[]>, msg: Message) => {
  //     let results: boolean[] = [];

  //     return acc
  //       .then((res: boolean[]) => {
  //         results = res;

  //         if (msg.IsRequest() && msg.req != undefined)
  //           return this.handleRequest(msg.req);

  //         else if (msg.IsResponse() && msg.resp != undefined)
  //           return this.handleResponse(msg.resp);

  //         throw ClientError('invalid Message: neither a Request nor a Response');
  //       })
  //       .then((res: boolean) => { return results.concat(res); })
  //       .catch((err: any) => { throw err; });
  //   }, Promise.resolve([]));
  // }

  // private handleRequest(req: Request): Promise<boolean> {
  //   return new Promise<boolean>((resolve, reject) => {
  //     let done = (body: any) => {
  //       if (req.id == undefined) { // if Notification
  //         resolve(false);
  //         return false;
  //       }

  //       return this.respond(req.id, body);
  //     };

  //     return this.services.Exec(req.method, this, req.params)
  //       .then((res: any) => { return done(res); })
  //       .catch((err: Error) => {
  //         this.emit('service', err, req);

  //         return done({
  //           code: 500,
  //           message: 'Server internal error',
  //           data: req
  //         });
  //       });
  //   });
  // }

  // private handleResponse(resp: Response): Promise<boolean> {
  //   let call = this.calls[resp.id];

  //   if (call == undefined)
  //     throw ClientError(`Call ${resp.id} not found`);

  //   delete this.calls[resp.id];

  //   console.log('111111111111111111', resp);

  //   if (resp.error == undefined) {
  //     call.Resolve(resp.result);
  //     return Promise.resolve(false);
  //   }

  //   call.Reject({
  //     name: 'ClientResponse',
  //     message: resp.error.message
  //   });

  //   return Promise.resolve(true);
  // }

  public Call(method: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    return this.request(id, method, params)
      .then(() => {
        let promise = call.Wait()
          .then((resp: any) => { delete this.calls[id]; return resp; })
          .catch((err: Error) => {
            delete this.calls[id];

            throw ClientError(err);
          });

        this.group.Add(promise);

        return promise;
      })
      .catch((err: Error) => {
        delete this.calls[id];

        return call.Reject(err);
      });
  }

  public Notify(method: string, ...params: any[]): Promise<boolean> {
    return this.request(undefined, method, params);
  }

  private request(
    id: number | undefined,
    method: string,
    params?: any[]): Promise<boolean> {

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

  private respond(
    id: number,
    result?: any,
    err?: RpcError): Promise<boolean> {

    return this.send(new Message(undefined, {
      id: id,
      result: result,
      error: err
    }));
  }

  private send(msg: Message): Promise<boolean> {
    this.emit('send', msg);

    return this.codec.Encode(msg)
      .then((flushed: boolean) => { return flushed; })
      .catch((err: Error) => {
        throw ClientError(err);
      });
  }

  public Stop(): Promise<void> {
    return this.cancelPendingCalls()
      .then(() => { return this.codec.Close(); })
      .catch((err: Error) => { throw ClientError(err); });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    let results: Result[];

    return this.group.Wait(timeout)
      .then((res: Result[]) => {
        results = res;

        return this.codec.Close();
      })
      .then(() => { return results; })
      .catch((err: Error) => { throw ClientError(err); });
  }

  private cancelPendingCalls(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let calls: Call[] = [];
      let err = ClientError('Call was canceled');

      for (let id in this.calls)
        if (this.calls.hasOwnProperty(id))
          calls.push(this.calls[id]);

      return Promise.all(calls.map((call: Call) => {
        return call.Reject(err);
      }))
        .then(() => { resolve(); })
        .catch((err: Error) => { reject(err); });
    });
  }

  public Handle(name: string, service: Service): void {
    this.services.Add(name, service);
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
    this.reject(CallError(err));
    return this.promise;
  }
}
