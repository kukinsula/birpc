import { Server } from './server';

function main() {
  let server = new Server('127.0.0.1', 20000);

  server.Add('foo', (args: any[]): Promise<any> => {
    return Promise.resolve('bar');
  });

  server.Add('bar', (args: any[]): Promise<any> => {
    return Promise.resolve('foo');
  });

  server.Start();

  process.on('exit', (code: number) => {
    server.Close()
      .then(() => { })
      .catch((err: Error) => { console.log(`Server.Close failed: ${err}`); });
  });
}

main();
