import * as net from 'net';

import { Codec, Message } from './codec';
import { CodecError } from './error';

export class JsonRpcCodec extends Codec {
  constructor(socket: net.Socket) {
    super(socket);
  }

  public Encode(msg: Message): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let str = '';

      if (msg.IsRequest()) str = JSON.stringify(msg.req);
      else if (msg.IsResponse()) str = JSON.stringify(msg.resp);
      else this.emit('error', CodecError(
        'Message to encode is neither a Request nor a Response'));

      return this.Write(str)
        .then(() => { resolve(); })
        .catch((err: Error) => { reject(err); });
    });
  }

  public Decode(buf: Buffer): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      let msg: Message = new Message();
      let raw: any = {};

      try { raw = JSON.parse(buf.toString()); } catch (err) {
        return reject(CodecError(`${err}`));
      }

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
          error: raw.error
        };
      } else return reject(CodecError('invalid Message'));

      resolve(msg);
    });
  }
}
