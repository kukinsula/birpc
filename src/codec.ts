import { EventEmitter } from 'events';
import { Socket } from 'net';

import { CodecError } from './error';

export interface Request {
  id?: number;
  method: string;
  params?: any[];
}

export interface Response {
  id: number;
  result?: any;
  error?: RpcError;
}

export interface RpcError {
  code: number,
  message: string,
  data: any
}

export class Message {
  public req: Request;
  public resp: Response;

  constructor(req?: Request, resp?: Response) {
    if (req != undefined) this.req = req;
    if (resp != undefined) this.resp = resp;
  }

  public IsRequest(): boolean {
    return this.req != undefined && this.req.method != '';
  }

  public IsResponse(): boolean {
    return this.resp != undefined && !this.IsRequest();
  }

  public toString(): string {
    if (this.IsRequest()) return JSON.stringify(this.req);
    else if (this.IsResponse()) return JSON.stringify(this.resp);
    else return 'Error: Message is neither a Request nor a Response';
  }
}

export abstract class Codec extends EventEmitter {
  private socket: Socket;
  private encoding: string;

  public abstract Encode(msg: Message): Promise<boolean>
  public abstract Decode(buf: Buffer): Promise<Message>

  constructor(socket: Socket, encoding: string = 'UTF-8') {
    super();

    this.socket = socket;
    this.encoding = encoding;

    this.socket.on('data', (buf: Buffer) => {
      let promise: Promise<Message>;

      try { promise = this.Decode(buf); } catch (err) {
        this.emit('error', CodecError(`${err}`));
        return;
      }

      promise
        .then((msg: Message) => { this.emit('data', msg); })
        .catch((err: Error) => { this.emit('error', err); });
    });

    this.socket.on('error', (err: any) => {
      this.emit('error', CodecError(`${err}`));
    });

    this.socket.on('end', () => {
      this.emit('end');
    });
  }

  protected Write(str: string, encoding: string = this.encoding)
    : Promise<boolean> {

    return new Promise<boolean>((resolve, reject) => {
      let flushed = this.socket.write(str, encoding, () => {
        resolve(flushed);
      });
    });
  }

  public Close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket.end();
      this.emit('end');

      resolve();
    });
  }

  public GetSocket(): Socket {
    return this.socket;
  }
}
