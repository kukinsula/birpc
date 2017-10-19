type Status = string;

export const
  Fulfilled: Status = 'Fulfilled',
  Rejected: Status = 'Rejected';

// TODO: classe Results ???
//
// public Resolveds(): Result[]
// public Rejecteds(): Result[]

export interface Result {
  status: Status
  value?: any
  reason?: any
}

type State = string

const
  None: State = 'None',
  Adding: State = 'Adding',
  Waiting: State = 'Waiting';

export class PromiseGroup {
  private state: State;
  private promises: { [id: number]: Promise<any> };
  private results: { [id: number]: Result };
  private id: number;
  private size: number;

  constructor() {
    this.reset();
  }

  private reset(): void {
    this.state = None;
    this.promises = {};
    this.results = {};
    this.id = 0;
    this.size = 0;
  }

  public Add(promise: Promise<any>): void {
    if (this.state == Waiting) throw new Error('forbiden to Add while Waiting');
    if (this.state == None) this.state = Adding;

    let id = this.id++;
    this.promises[id] = this.wrap(promise, id);
    this.size++;
  }

  private wrap(promise: Promise<any>, id: number): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      let done = ((result: Result) => {
        if (this.state == Waiting)
          return resolve(result);

        this.results[id] = result;
        delete this.promises[id];
        this.size--;
      });

      promise
        .then((v: any) => { done({ status: Fulfilled, value: v }); })
        .catch((err: any) => { done({ status: Rejected, reason: err }); });
    });
  }

  public Wait(timeout?: number): Promise<Result[]> {
    if (this.state == Waiting) return Promise.reject('already waiting');
    if (this.state == None) return Promise.resolve([]);

    let promises: Promise<any>[] = [];
    let timer: NodeJS.Timer;

    if (timeout != undefined)
      promises.push(new Promise<any>((resolve, reject) => {
        console.log('XXXXXXXXX');
        timer = setTimeout(() => {
          console.log('YYYYYYYYYY');
          reject(new Error('timeout'));
        }, timeout);
      }));

    this.state = Waiting;

    let merge = Object.assign(this.promises, this.results);

    for (let id = 0; id < this.size; id++)
      if (merge.hasOwnProperty(id))
        promises[id] = merge[id];

    return Promise.all(promises)
      .then((results: Result[]) => {
        clearTimeout(timer);
        this.reset();
        return results;
      })
      .catch((err: Error) => {
        clearTimeout(timer);
        this.reset();
        return Promise.reject(err);
      });
  }

  public Size(): number {
    return this.size;
  }
}
