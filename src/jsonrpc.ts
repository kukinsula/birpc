import * as net from 'net';

import { Codec, Message } from './codec';
import { CodecError } from './error';

export class JsonRpcCodec extends Codec {
  constructor(socket: net.Socket) {
    super(socket);
  }

  public Encode(msg: Message): void {
    let str = '';

    if (msg.IsRequest())
      str = JSON.stringify(msg.req);
    else if (msg.IsResponse())
      str = JSON.stringify(msg.resp);
    else
      this.emit('error', CodecError(
        `Message to encode is neither a Request nor a Response`));

    this.Write(str);
  }

  public Decode(str: string): Message {
    let msg: Message = new Message();
    let raw: any = {};

    try { raw = JSON.parse(str); } catch (err) { throw `${err}`; }

    if (raw.method != undefined && raw.method != '') {
      msg.req = {
        id: raw.id,
        method: raw.method,
        params: raw.params
      };
    } else if (raw.result != undefined || raw.error != undefined) {
      msg.resp = {
        id: raw.id,
        result: raw.result,
        error: raw.error,
      };
    } else {
      throw `Invalid Message`;
    }

    return msg;
  }
}
