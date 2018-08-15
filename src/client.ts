import * as net from 'net';
import * as stream from 'stream';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

import { Codec, Message, Request, Response, RpcError } from './codec';
import { ServiceSet, Service } from './service';
import { PromiseGroup, Result } from './promise';

const es = require('event-stream');

export interface ClientConfig {
  socket: net.Socket
  codec: Codec
  server?: boolean
  services?: ServiceSet
  timeout?: number
  keepAliveDelay?: number
}

export class Client extends EventEmitter {
  private socket: net.Socket;
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

    this.socket = config.socket;
    this.codec = config.codec;
    this.services = config.services || new ServiceSet();
    this.id = 0;
    this.calls = {};
    this.server = config.server || false;
    this.group = new PromiseGroup();

    this.Address = this.server ?
      `${this.socket.remoteAddress}:${this.socket.remotePort}` :
      `${this.socket.localAddress}:${this.socket.localPort}`;

    this.Prefix = (this.server ? 'Client* ' : 'Client ') + this.Address;

    if (config.timeout != undefined) {
      this.socket.setTimeout(config.timeout);
      this.socket.on('timeout', () => { this.emit('timeout') });
    }

    if (config.keepAliveDelay != undefined)
      this.socket.setKeepAlive(true, config.keepAliveDelay)
  }

  public Start(): void {
    this.socket

      .pipe(this.codec.Decode())
      .on('error', (err: any) => { this.emit('error', err); })

      .pipe(this.parse())
      .on('error', (err: any) => { this.emit('error', err); })

      .pipe(this.process())
      .on('error', (err: any) => { this.emit('error', err); })

      .pipe(es.mapSync((resp: Response) => {
        this.emit('send', new Message(undefined, resp));

        return resp;
      }))

      .pipe(this.codec.Encode())
      .on('error', (err: any) => { this.emit('error', err); })

      .pipe(this.socket)

      .on('error', (err: any) => { this.emit('error', err); });
  }

  private parse(): stream.Duplex {
    return es.map((raw: any, done: (err?: null | any, data?: null | any) => void) => {
      let msg = new Message();

      if (raw.method != undefined && raw.method != '')
        msg.req = {
          id: raw.id,
          method: raw.method,
          params: raw.params
        };

      else if (raw.result != undefined || raw.error != undefined)
        msg.resp = {
          id: raw.id,
          result: raw.result,
          error: raw.error
        };

      else
        return done(new Error('Client invalid Message: neither a Request nor a Response'));

      done(null, msg);
    });
  }

  private process(): stream.Duplex {
    return es.map((msg: Message, done: (err?: null | any, data?: null | any) => void) => {
      this.emit('receive', msg);

      if (msg.IsRequest() && msg.req != undefined)
        return this.processRequest(msg.req)
          .then((result: any) => {
            if (msg.req != undefined && msg.req.id == undefined) // Notifications
              return done()

            let resp = {
              id: msg.req == undefined ? undefined : msg.req.id,
              result: result
            };

            done(null, resp);
          })
          .catch((err: any) => {
            let resp = {
              id: msg.req == undefined ? undefined : msg.req.id,
              error: err
            };

            done(null, resp);
          });

      else if (msg.IsResponse() && msg.resp != undefined) {
        this.processResponse(msg.resp);

        return done();
      }

      else
        return done(new Error('Client invalid Message: neither a Request nor a Response'));
    });
  }

  private processRequest(req: Request): Promise<Response> {
    return this.services.Exec(req.method, this, req.params)
      .then((result: any) => { return result; })
      .catch((err: any) => {
        console.log('processRequest ERROR:', err);

        return {
          id: req.id as number,
          error: {
            code: 500,
            message: 'Server internal error',
            data: req
          }
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
      call.Reject(resp.error);
  }

  public Call(method: string, ...params: any[]): Promise<any> {
    let id = this.id++;
    let call = new Call();

    this.calls[id] = call;

    return this.request(id, method, params)
      .then(() => {
        let promise = call.Wait()
          .then((resp: any) => {
            delete this.calls[id];

            return resp;
          })
          .catch((err: Error) => {
            delete this.calls[id];

            throw err;
          });

        this.group.Add(promise);

        return promise;
      })
      .catch((err: Error) => {
        delete this.calls[id];

        return call.Reject({
          code: 500,
          message: err.message,
          data: err
        });
      });
  }

  public Notify(method: string, ...params: any[]): Promise<void> {
    return this.request(undefined, method, params);
  }

  private request(id: number | undefined, method: string, params?: any[]): Promise<void> {
    if (params != undefined) {
      let len = params.length;

      if (len == 0)
        params = undefined;

      else if (len == 1)
        params = params[0];
    }

    return this.send(new Message({
      id: id,
      method: method,
      params: params
    }));
  }

  private respond(id: number, result?: any, err?: RpcError): Promise<void> {
    return this.send(new Message(undefined, {
      id: id,
      result: result,
      error: err
    }));
  }

  private send(msg: Message): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let sender = new stream.Readable({ objectMode: true });

      sender
        .pipe(this.codec.Encode())
        .on('error', (err: any) => { this.emit('error', err); reject(err); })

        // TODO: PK ça marche pas ???
        // 
        // .pipe(this.socket)
        // .on('error', (err: any) => { this.emit('error', err); reject(err); })

        .pipe(es.map((buffer: Buffer, done: (err?: null | any, data?: null | any) => void) => {
          this.write(buffer)
            .then(() => {
              this.emit('send', msg);

              resolve();
              done();
            })
            .catch((err: any) => { done(err); });
        }))
        .on('error', (err: any) => { this.emit('error', err); reject(err); });

      let data = msg.IsRequest() ? msg.req : msg.resp;

      sender.push(data);
      sender.push(null);
    });
  }

  private write(buffer: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket.write(buffer, 'utf-8', (err: any) => {
        if (err != undefined)
          return reject(err);

        resolve();
      });
    });
  }

  public Stop(): Promise<void> {
    return this.cancelPendingCalls()
      .then(() => { return this.Close(); })
      .catch((err: Error) => { throw err; });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    let results: Result[];

    return this.group.Wait(timeout)
      .then((res: Result[]) => {
        results = res;

        return this.Close();
      })
      .then(() => { return results; })
      .catch((err: Error) => { throw err; });
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket.on('close', () => {
        this.emit('close');

        resolve();
      });

      this.socket.end();
    });
  }

  private cancelPendingCalls(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let calls: Call[] = [];
      let err = new Error('Client: Call was canceled');

      for (let id in this.calls)
        if (this.calls.hasOwnProperty(id))
          calls.push(this.calls[id]);

      return Promise.all(calls.map((call: Call) => {
        return call.Reject({
          code: 500,
          message: err.message,
          data: err
        });
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

  public Wait(): Promise<Response> {
    return this.promise;
  }

  public Resolve(res: any): Promise<any> {
    this.resolve(res);
    return this.promise;
  }

  public Reject(err: RpcError): Promise<Response> {
    this.reject(err);
    return this.promise;
  }
}
