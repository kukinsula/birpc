import * as stream from 'stream';

export interface Codec {
  Decode(): stream.Duplex
  Encode(): stream.Duplex
}

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
  public req?: Request;
  public resp?: Response;

  constructor(req?: Request, resp?: Response) {
    if (req != undefined)
      this.req = req;

    if (resp != undefined)
      this.resp = resp;
  }

  public IsRequest(): boolean {
    return this.req != undefined && this.req.method != '';
  }

  public IsNotification(): boolean {
    return this.IsRequest() && this.req != undefined && this.req.id == undefined;
  }

  public IsResponse(): boolean {
    return this.resp != undefined && !this.IsRequest();
  }

  public toString(): string {
    if (this.IsRequest())
      return JSON.stringify(this.req);

    else if (this.IsResponse())
      return JSON.stringify(this.resp);

    else
      return 'Error: Message is neither a Request nor a Response';
  }
}
