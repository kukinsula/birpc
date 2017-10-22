function error(name: string): (v: Error | string) => Error {
  return ((v: Error | string): Error => {
    let err = new Error();

    if (typeof v == 'string') {
      err.name = name || 'Error';
      err.message = v;

      if (err.stack != undefined)
        err.stack = err.stack.split("\n")
          .slice(v.split('\n').length + 1)
          .join("\n");
    } else {
      err.name = name + ' ' + v.name;
      err.message = v.message;
      err.stack = v.stack;
    }

    if (err.stack != undefined)
      err.stack = err.stack.split('\n')
        .filter((line: string) => { return line.match(/    at /) != null; })
        .join('\n');

    return err;
  });
}

export const
  ServerError = error('Server'),
  ClientError = error('Client'),
  CallError = error('Call'),
  CodecError = error('Codec'),
  ServiceError = error('Service'),
  PromiseGroupError = error('PromiseGroup');
