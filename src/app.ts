import { Server } from './server';
import { Client } from './client';

// TODO:
//
// * PromiseGroup (avec méthode Done(id: number))
// * Server.Wait
// * Client.Wait
// * Client.cancelPendingCalls
// * Server/Client EventEmitter
// * Keep-Alive
// * Timeout

function main() {
  let server = new Server('127.0.0.1', 20000);

  server.Add('Add', (client: Client, args: any): Promise<any> => {
    return Promise.resolve(args.reduce((acc: number, current: number) => {
      return acc + current;
    }, 0));
  });

  server.Add('Mult', (client: Client, args: any): Promise<any> => {
    return Promise.resolve(args.reduce((acc: number, current: number) => {
      return acc * current;
    }, 1));
  });

  server.Start();

  process.on('exit', (code: number) => {
    server.Shutdown()
      .then(() => { })
      .catch((err: Error) => {
        console.log(`Server.Close failed: ${err}`);
      });
  });
}

main();
