const
  assert = require('assert');

import { describe, it, before, after } from 'mocha';

import { PromiseGroup, Result, Fulfilled, Rejected } from '../src/promise';

describe('Promise Group', () => {
  it('Add resolved and rejected Promises', (done: any) => {
    let group = new PromiseGroup();

    assert.equal(group.Size(), 0);

    group.Add(Promise.resolve(1));
    group.Add(Promise.resolve(2));
    group.Add(Promise.resolve(3));

    group.Add(Promise.reject('rejected'));
    group.Add(Promise.reject(new Error('rejected')));
    group.Add(Promise.reject(42));

    assert.equal(group.Size(), 6);

    group.Wait()
      .then((res: Result[]) => {
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
});
