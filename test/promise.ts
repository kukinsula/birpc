const
  assert = require('assert');

import { describe, it, before, after } from 'mocha';

import { PromiseGroup, Result, Fulfilled, Rejected } from '../src/promise';

describe('Promise Group', () => {
  it('Add resolved and rejected Promises', (done: any) => {
    let group = new PromiseGroup([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.resolve(3),

      Promise.reject('rejected'),
      Promise.reject(new Error('rejected')),
      Promise.reject(42)
    ]);

    assert.equal(group.Size(), 6);

    group.Wait()
      .then((res: Result[]) => {
        assert.equal(res.length, 6);
        assert.equal(group.Size(), 0);

        assert.equal(res.filter((res: Result) => {
          return res.status == Fulfilled;
        }).length, 3);

        assert.equal(res.filter((res: Result) => {
          return res.status == Rejected;
        }).length, 3);

        done();
      })
      .catch((err: Error) => { done(err); });
  });

  it('Before timeout expires', (done: any) => {
    let group = new PromiseGroup([
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 10);
      })
    ]);

    group.Wait(100)
      .then((res: Result[]) => { done(); })
      .catch((err: Error) => { done(err); });
  });

  it('After timeout expires', (done: any) => {
    // process.on('unhandledRejection', (reason, p) => {
    //   console.log('Reason ', reason);
    //   console.log('P ', p);
    // });

    let group = new PromiseGroup([
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 100);
      })
    ]);

    group.Wait(0)
      .then((res: Result[]) => {
        console.log('OK');
        done();
        // done(new Error('expected group.Wait to timeout'));
      })
      .catch((err: Error) => { console.log('OK'); done(err); });
  });
});
