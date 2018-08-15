import * as stream from 'stream';

const JSONStream = require('JSONStream');

import { Codec } from './codec';

export class JsonRpcCodec implements Codec {
  constructor() { }

  public Decode(): stream.Duplex {
    return JSONStream.parse();
  }

  public Encode(): stream.Duplex {
    return JSONStream.stringify('', '', '');
  }
}
