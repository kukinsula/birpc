import * as net from 'net';
import * as readline from 'readline';

import * as birpc from '../../src/birpc';

const PORT = 20000;

function Chat() {
  return NewClient(PORT)
    .then((client: birpc.Client) => {
      let reader = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });

      let repl = () => {
        reader.question('> ', (msg: string) => {
          let args = {
            room: 'test',
            message: msg
          };

          client.Notify('message', args)
            .then((result: any) => { return repl(); })
            .catch((err: any) => { client.Stop(); });
        });
      };

      repl();
    })
    .catch((err: any) => { console.log('ERROR', err); });
}

function NewClient(port: number): Promise<birpc.Client> {
  return new Promise<birpc.Client>((resolve, reject) => {
    let socket = net.createConnection({ port: port }, () => {
      let client = new birpc.Client({
        codec: new birpc.JsonRpcCodec(socket),
        // timeout: 20000,
        keepAliveDelay: 20000
      });

      client.on('receive', (msg: birpc.Message) => {
        if (msg.IsRequest()) {
          let req = msg.req as any;

          console.log(`\n${req.params.from}> ${req.params.message}`);
          process.stdout.write('> ');
        }
      });

      client.Start();

      resolve(client);
    });
  });
}

Chat();
