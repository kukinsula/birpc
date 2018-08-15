import * as net from 'net';

import * as birpc from '../../src/birpc';

const
  PORT = 20000,
  WORKERS = 100;

function Stress(): void {
  process.once('SIGINT', () => {
    console.log(`Exiting...`);

    quit = true;

    process.exit(0);
  });

  for (let index = 0; index < WORKERS; index++)
    NewClient()
      .then((client: birpc.Client) => {
        client.on('error', (err: any) => {
          console.log(`${client.Prefix} ${err}`);

          quit = true;

          client.Stop();
        });

        client.on('close', () => {
          console.log(`${client.Prefix} connection closed`)
        });

        client.services.Add('message', (client: birpc.Client, args: any) => {
          console.log(`\n${args.from}> ${args.message}`);
          process.stdout.write('> ');

          return Promise.resolve();
        });

        stresser(client);
      })
      .catch((err: any) => { throw err; });
}

function NewClient(): Promise<birpc.Client> {
  return new Promise<birpc.Client>((resolve, reject) => {
    let socket = net.createConnection({ port: PORT }, () => {
      let client = new birpc.Client({
        socket: socket,
        codec: new birpc.JsonRpcCodec(),
        // timeout: 20000,
        keepAliveDelay: 20000
      });

      client.Start();

      resolve(client);
    });
  });
}

let calls = 0;
let quit = false;

function stresser(client: birpc.Client): Promise<void> {
  let sleep = 200 + Math.floor(Math.random() * Math.floor(500));

  if (quit)
    return client.Stop();

  return new Promise<void>((resolve) => {
    setTimeout(() => { resolve(); }, sleep);
  })
    .then(() => {
      let args = {
        room: 'test',
        message: 'This is my message!'
      };

      return client.Notify('message', args);
    })
    .then((result: any) => {
      calls++;

      if (calls % 1000 == 0)
        console.log(`${calls} calls sent!`);

      return stresser(client);
    })
    .catch((err: any) => { client.Stop(); });
}

Stress();
