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

  // TODO: merger Wait et WaitTimeout en une seule méthode
  public Wait(): Promise<Result[]> {
    if (this.state == Waiting) return Promise.reject('already waiting');
    if (this.state == None) return Promise.resolve([]);

    this.state = Waiting;

    let merge = Object.assign(this.promises, this.results);
    let promises: Promise<any>[] = [];

    for (let id = 0; id < this.size; id++)
      if (merge.hasOwnProperty(id))
        promises[id] = merge[id];

    return Promise.all(promises)
      .then((results: Result[]) => { this.reset(); return results; });
  }

  public WaitTimeout(timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timer = setTimeout(() => {
        reject('timeout exceeded');
      }, timeout);

      return this.Wait()
        .then((results: Result[]) => { clearTimeout(timer); return results; })
        .catch((err: Error) => { reject(err); })
    });
  }

  public Size(): number {
    return this.size;
  }
}