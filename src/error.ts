function error(name: string): (message: string) => Error {
  return (message: string) => {
    if (typeof message != 'string') message = `${message}`;

    let err = new Error(message);

    err.name = name;

    if (err.stack != undefined) {
      let lines = err.stack.split('\n');
      err.stack = lines.slice(message.split('\n').length + 1).join('\n');
    }

    return err;
  };
}

export const
  ServerError = error('Server'),
  ClientError = error('Client'),
  CodecError = error('Codec'),
  ServiceError = error('Service'),
  CanceledCallError = error('Call');

// export function ServiceError(code: number, message: string, data: any): Error {
//   return error('Service')(``);
// }
