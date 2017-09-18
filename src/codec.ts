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
    else return JSON.stringify(this.resp);
  }
}

export interface Codec {
  Encode(msg: Message): string
  Decode(str: string): Message
}

export class JsonRpcCodec implements Codec {
  public Encode(msg: Message): string {
    if (msg.IsRequest()) return JSON.stringify(msg.req);
    else return JSON.stringify(msg.resp);
  }

  public Decode(str: string): Message {
    let msg: Message = new Message();
    let raw: any = {};

    try { raw = JSON.parse(str); } catch (err) { throw `${err}`; }

    if (raw.method != '') {
      msg.req = {
        id: raw.id,
        method: raw.method,
        params: raw.params
      };
    } else {
      msg.resp = {
        id: raw.id,
        result: raw.result,
        error: raw.error,
      };
    }

    return msg;
  }
}
