import { Client } from './client';
import { ServiceError } from './error';

export type Service = (client: Client, args: any) => Promise<any>

export class ServiceSet {
  private services: { [name: string]: Service };
  constructor() { this.services = {}; }

  public Add(name: string, service: Service): void {
    this.services[name] = service;
  }

  public Exec<T extends Client>(name: string, client: T | Client, args: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let service = this.services[name];

      if (service == undefined)
        return reject(ServiceError(`Service '${name}' does not exist`));

      service.call(service, client, args)
        .then((res: any) => { resolve(res); })
        .catch((err: any) => { reject(ServiceError(`${err}`)); });
    });
  }
}
