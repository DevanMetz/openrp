import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContractBook, type ContractResident } from '../server/contracts.ts';
function fixture() {
  let time = 100000,
    near = true;
  const people = new Map<string, ContractResident>(
    ['customer', 'hitman', 'target', 'outsider'].map((id) => [
      id,
      { id, money: 1500, alive: true, available: true, hitman: id === 'hitman' },
    ]),
  );
  const book = new ContractBook(
    (id) => people.get(id),
    () => time,
    () => near,
  );
  return {
    people,
    book,
    advance: (ms: number) => {
      time += ms;
    },
    far: () => {
      near = false;
    },
  };
}
test('contracts escrow once and pay the assigned hitman exactly once for the target death', () => {
  const { book, people } = fixture();
  const c = book.request('customer', 'hitman', 'target', 500);
  assert.equal(people.get('customer')!.money, 1000);
  book.accept('hitman', c.id);
  assert.throws(() => book.accept('hitman', c.id));
  book.death('target', 'hitman');
  book.death('target', 'hitman');
  book.tick();
  assert.equal(people.get('hitman')!.money, 2000);
  assert.equal(book.contracts.size, 0);
  assert.throws(() => book.request('customer', 'hitman', 'target', 500));
});
test('requests reject invalid participants, ranges, prices and duplicates without debiting wallets', () => {
  const f = fixture();
  for (const price of [0, -1, 249, 1501, 1.5, NaN, Infinity, '500', true])
    assert.throws(() => f.book.request('customer', 'hitman', 'target', price));
  assert.throws(() => f.book.request('customer', 'outsider', 'target', 500));
  assert.throws(() => f.book.request('customer', 'hitman', 'customer', 500));
  f.far();
  assert.throws(() => f.book.request('customer', 'hitman', 'target', 500));
  assert.equal(f.people.get('customer')!.money, 1500);
});
test('cancellation, expiry, wrong killer and participant exit refund exactly once', () => {
  for (const mode of ['cancel', 'expire', 'wrong-killer', 'exit', 'role']) {
    const { book, people, advance } = fixture();
    const c = book.request('customer', 'hitman', 'target', 500);
    assert.throws(() => book.cancel('outsider', c.id));
    book.accept('hitman', c.id);
    if (mode === 'cancel') book.cancel('customer', c.id);
    if (mode === 'expire') advance(600000);
    if (mode === 'wrong-killer') book.death('target', 'outsider');
    if (mode === 'exit') book.unavailable('hitman');
    if (mode === 'role') people.get('hitman')!.hitman = false;
    book.tick();
    book.tick();
    assert.equal(people.get('customer')!.money, 1500, mode);
    assert.equal(people.get('hitman')!.money, 1500);
    assert.equal(book.contracts.size, 0);
  }
});
test('full or missing wallets retain settlement and cannot redirect or duplicate it', () => {
  const { book, people } = fixture();
  const c = book.request('customer', 'hitman', 'target', 500);
  book.accept('hitman', c.id);
  people.get('hitman')!.money = 1e9;
  book.death('target', 'hitman');
  assert.equal(book.contracts.get(c.id)?.status, 'payout');
  assert.throws(() => book.cancel('customer', c.id));
  book.unavailable('target');
  book.tick();
  assert.equal(book.contracts.get(c.id)?.status, 'payout');
  people.get('hitman')!.money -= 500;
  book.tick();
  assert.equal(people.get('hitman')!.money, 1e9);
  book.tick();
  assert.equal(book.contracts.size, 0);
});

test('missing refund wallets retain escrow until they return; expired offers cannot be accepted', () => {
  const { book, people, advance } = fixture();
  const c = book.request('customer', 'hitman', 'target', 500);
  const customer = people.get('customer')!;
  people.delete('customer');
  advance(30000);
  assert.throws(() => book.accept('hitman', c.id));
  assert.equal(book.contracts.get(c.id)?.status, 'refund');
  book.tick();
  assert.equal(book.contracts.size, 1);
  people.set('customer', customer);
  book.tick();
  assert.equal(customer.money, 1500);
  assert.equal(book.contracts.size, 0);
});
