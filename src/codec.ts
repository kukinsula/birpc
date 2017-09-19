import { EventEmitter } from 'events';
import * as net from 'net';

import { CodecError } from './error';

export interface Request {
  id?: number;
  method: string;
  params: any;
}

export interface Response {
  id: number;
  result?: any;
  error?: {
    code: number,
    message: string,
    data: any
  };
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
    else return 'Message is neither a Request nor a Response';
  }
}

export abstract class Codec extends EventEmitter {
  private socket: net.Socket;

  abstract Encode(msg: Message): void
  abstract Decode(str: string): Message

  constructor(socket: net.Socket) {
    super();

    this.socket = socket;

    this.socket.on('data', (buf: Buffer) => {
      let message: Message;

      try { message = this.Decode(buf.toString()); } catch (err) {
        this.emit('error', CodecError(`${err}`));
        return;
      }

      this.emit('data', message);
    });

    this.socket.on('error', (err: any) => {
      this.emit('error', CodecError(`${err}`));
    });

    this.socket.on('end', () => {
      this.emit('end');
    });
  }

  protected Write(str: string): void {
    this.socket.write(str, 'UTF8');
  }

  public Close(): void { this.socket.end(); }

  public GetSocket(): net.Socket { return this.socket; }
}
