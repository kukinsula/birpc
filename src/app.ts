import { Server } from './server';
import { Client } from './client';
import { Result } from './promise';

// TODO:
//
// * Server/Client EventEmitter
//   Server Events: listening, connection, error, close, end, shutdown, wait
//   Client Events: start, stop, error, close, end, wait, send
//
// * PromiseGroup:
//   * Constructor avec un Promise<any>[]
//   * Cancel a Wait
//
// * Server prefix dans les logs
// * Server.Wait
// * Client.Wait
// * Client.cancelPendingCalls
// * Keep-Alive
// * Timeout

function main() {
  let server = new Server('127.0.0.1', 20000);

  server.Add('Add', (client: Client, args: any): Promise<any> => {
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(args.reduce((acc: number, current: number) => {
          return acc + current;
        }, 0));
      }, 5000);
    });
  });

  server.Add('Mult', (client: Client, args: any): Promise<any> => {
    return Promise.resolve(args.reduce((acc: number, current: number) => {
      return acc * current;
    }, 1));
  });

  server.Start();

  process.on('SIGINT', () => {
    console.log('Exiting...');

    return server.Wait()
      .then((res: Result[]) => { console.log('Done:', JSON.stringify(res, undefined, 2)); })
      .catch((err: Error) => {
        console.log(`Server.Close failed: ${err}`);
      });
  });
}

main();
