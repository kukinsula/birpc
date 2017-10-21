import * as birpc from './../../src/birpc';

export class Client extends birpc.Client {
  constructor(options: birpc.ClientConfig) {
    super(options);

    this.on('start', () => {
      console.log(`${this.Prefix} started bidirectional RPC!`);
    });
    this.on('receive', (msg: birpc.Message) => {
      console.log(`${this.Prefix} <- ${msg.toString()}`);
      this.Process(msg);
    });
    this.on('send', (msg: birpc.Message) => {
      console.log(`${this.Prefix} -> ${msg.toString()}`);
    });

    this.on('error', (err: Error) => {
      console.error(`${this.Prefix} ${err.name}: ${err.message}\n${err.stack}`);

      this.done();
    });

    this.on('service', (err: Error, req: Request) => {
      console.log(`${this.Prefix} Service '${req.method}' Exec failed: ` +
        `${err.name}: ${err.message}\n${err.stack}\n\n`);
    });

    this.once('timeout', () => {
      console.log(`${this.Prefix} timeout!`);
      this.done();
    });

    this.on('end', () => {
      console.log(`${this.Prefix} end!`);
    });
  }

  private done(): void {
    this.Wait(5000)
      .then((res: birpc.Result[]) => {
        console.log(`${this.Prefix} waited for ${res.length} calls`);
      })
      .catch((err: Error) => {
        console.error(`${this.Prefix} ${err.name}: ${err.message}\n${err.stack}`);
      });
  };
}
