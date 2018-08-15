import * as net from 'net';
import * as readline from 'readline';

import * as birpc from '../../src/birpc';

const PORT = 20000;

function Chat() {
  let chatter: birpc.Client;

  return NewClient(PORT)
    .then((client: birpc.Client) => {
      chatter = client;

      client.Start();

      let reader = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });

      client.on('error', (err: any) => {
        console.log(`${client.Prefix} ${err}`);

        reader.close();
        client.Close();
      });

      client.on('close', () => {
        console.log(`${client.Prefix} connection closed`)
        reader.close();
      });

      let repl = (): Promise<void> => {
        return new Promise<any>((resolve, reject) => {
          reader.question('> ', (msg: string) => {
            let args = {
              room: 'test',
              message: msg
            };

            resolve(args);
          });
        })
          .then((args: any) => { return chatter.Notify('message', args); })
          .then((result: any) => { return repl(); })
          .catch((err: any) => { throw err });
      };

      return repl();
    })
    .catch((err: any) => {
      console.log(`${chatter.Address} failure: ${err}`);

      return chatter.Stop()
    });
}

function NewClient(port: number): Promise<birpc.Client> {
  return new Promise<birpc.Client>((resolve, reject) => {
    let socket = net.createConnection({ port: port }, () => {
      let client = new birpc.Client({
        socket: socket,
        codec: new birpc.JsonRpcCodec(),
        // timeout: 20000,
        keepAliveDelay: 20000
      });

      client.services.Add('message', (client: birpc.Client, args: any) => {
        console.log(`\n${args.from}> ${args.message}`);
        process.stdout.write('> ');

        return Promise.resolve();
      });

      resolve(client);
    });
  });
}

Chat()
  .then(() => { exit(0); })
  .catch((err: any) => { exit(1, err); });

function exit(code: number, err?: Error) {
  if (err != undefined)
    console.log(`${err.stack}`);

  console.log('Done!');

  process.exit(code);
}
