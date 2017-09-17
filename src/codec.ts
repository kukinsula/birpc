export interface Request {
  id: number;
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

export interface Codec {
  Encode(v: Request | Response): string
  Decode(v: string): Request | Response
}

export class JsonRpcCodec implements Codec {
  public Encode(v: Request | Response): string {
    return JSON.stringify(v);
  }

  public Decode(v: string): Request | Response {
    let message: any = {};

    try { message = JSON.parse(v); } catch (err) { throw `${err}`; }

    if (message.id % 2 == 0) {
      let req: Request = {
        id: message.id,
        method: message.method,
        params: message.params
      };

      return req;
    }

    let resp: Response = {
      id: message.id,
      result: message.result == undefined ? undefined : message.result,
      error: message.error == undefined ? undefined : message.error,
    };

    return resp;
  }
}
