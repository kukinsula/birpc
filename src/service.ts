import { ServiceError } from './error';

export type Service = (args: any[]) => Promise<any>

export class ServiceSet {
  private services: { [name: string]: Service };

  constructor() { this.services = {}; }

  public Add(name: string, service: Service): void {
    this.services[name] = service;
  }

  public Exec(name: string, args: any[]): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let service = this.services[name];

      if (service == undefined)
        return reject(ServiceError(`Service '${name}' does not exist`));

      service.call(args)
        .then((res: any) => { resolve(res); })
        .catch((err: any) => { reject(ServiceError(`${err}`)); });
    });
  }
}
