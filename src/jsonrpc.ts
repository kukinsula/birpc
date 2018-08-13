import * as net from 'net';
import * as os from 'os';

import { Codec, Message } from './codec';
import { CodecError } from './error';

const es = require('event-stream');

export class JsonRpcCodec extends Codec {
  constructor(socket: net.Socket) {
    super(socket);

    // let RequestOrResponse = es.map((data: any, cb: (err?: null | any, data?: null | any) => void) => {
    //   console.log('DECODE', data);

    //   let msg = new Message();

    //   if (data.method != undefined && data.method != '') {
    //     msg.req = {
    //       id: data.id,
    //       method: data.method,
    //       params: data.params
    //     };
    //   }

    //   else if (data.result != undefined || data.error != undefined) {
    //     msg.resp = {
    //       id: data.id,
    //       result: data.result,
    //       error: data.error
    //     };
    //   }

    //   else
    //     cb(new Error('JSON RPC Codec invalid Message'));

    //   cb(null, msg);
    // });

    // let unwrapMessage = es.map((msg: Message, cb: (err?: null | any, data?: null | any) => void) => {
    //   console.log('UNWRAP MESSAGE', msg);

    //   if (msg.IsRequest())
    //     return cb(null, msg.req);

    //   else if (msg.IsResponse())
    //     return cb(null, msg.resp);

    //   else
    //     cb(new Error('Message to encode is neither a Request nor a Response'));
    // });

    // socket
    //   .pipe(JSONStream.parse())
    //   .pipe(es.map((data: any, cb: (err?: null | any, data?: null | any) => void) => {
    //     console.log('DATA 1', data);

    //     let msg = new Message();

    //     if (data.method != undefined && data.method != '') {
    //       msg.req = {
    //         id: data.id,
    //         method: data.method,
    //         params: data.params
    //       };
    //     }

    //     else if (data.result != undefined || data.error != undefined) {
    //       msg.resp = {
    //         id: data.id,
    //         result: data.result,
    //         error: data.error
    //       };
    //     }

    //     else
    //       cb(new Error('JSON RPC Codec invalid Message'));

    //     cb(null, msg);
    //   }))
    //   .pipe(es.mapSync((data: any) => {
    //     console.log('DATA 2', data);
    //   }));

    // socket
    //   .pipe(JSONStream.parse())

    //   .pipe(RequestOrResponse)

    //   .pipe(es.mapSync((data: any) => {

    //   }))

    //   .pipe(unwrapMessage)
    //   .pipe(JSONStream.stringify('', '', ''))
    //   .pipe(es.mapSync((data: any) => {
    //     console.log('XXX', data);
    //   }));
  }

  // public decode() {
  //   return es

  //     .pipe(es.mapSync((data: any) => {
  //       console.log('DATA 2', data);

  //       return data;
  //     }))

  //     .pipe(JSONStream.parse())

  //     .pipe(es.mapSync((data: any) => {
  //       console.log('DATA 3', data);

  //       return data;
  //     }))

  //     .pipe(es.map((data: any, cb: (err?: null | any, data?: null | any) => void) => {
  //       let msg = new Message();

  //       if (data.method != undefined && data.method != '') {
  //         msg.req = {
  //           id: data.id,
  //           method: data.method,
  //           params: data.params
  //         };
  //       }

  //       else if (data.result != undefined || data.error != undefined) {
  //         msg.resp = {
  //           id: data.id,
  //           result: data.result,
  //           error: data.error
  //         };
  //       }

  //       else
  //         cb(new Error('JSON RPC Codec invalid Message'));

  //       cb(null, msg);
  //     }));
  // }

  // public encode() {
  //   return es.pipe(JSONStream.stringify('', '', ''));
  // }

  public Encode(msg: Message): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let str = '';

      if (msg.IsRequest())
        str = JSON.stringify(msg.req);

      else if (msg.IsResponse())
        str = JSON.stringify(msg.resp);

      else {
        let err = CodecError('Message to encode is neither a Request nor a Response');
        this.emit('error', err);

        return reject(err);
      }

      str += os.EOL;

      return this.Write(str)
        .then((flushed: boolean) => { resolve(flushed); })
        .catch((err: Error) => { reject(err); });
    });
  }

  public Decode(buffer: Buffer): Promise<Message[]> {
    return new Promise<Message[]>((resolve, reject) => {
      let lines = buffer.toString().split(os.EOL);
      let messages = lines.reduce((acc: Message[], str: string) => {
        if (str == '')
          return acc;

        let msg: Message = new Message();
        let raw: any = {};

        try {
          raw = JSON.parse(str);
        } catch (err) {
          throw CodecError(err);
        }

        if (raw.method != undefined && raw.method != '') {
          msg.req = {
            id: raw.id,
            method: raw.method,
            params: raw.params
          };
        }

        else if (raw.result != undefined || raw.error != undefined) {
          msg.resp = {
            id: raw.id,
            result: raw.result,
            error: raw.error
          };
        }

        else
          throw CodecError('invalid Message');

        return acc.concat(msg);
      }, []);

      resolve(messages);
    });
  }
}
