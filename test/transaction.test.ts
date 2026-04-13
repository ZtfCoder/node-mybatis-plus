import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id } from '../src/decorator';
import { BaseMapper } from '../src/mapper/base-mapper';
import { createDataSource } from '../src/core/datasource';
import { withTransaction, setDefaultDataSource, Transactional } from '../src/core/transaction';
import type { DataSource } from '../src/types';

@Table('account')
class Account {
  @Id({ type: 'auto' }) id!: number;
  @Column() name!: string;
  @Column() balance!: number;
}

class AccountMapper extends BaseMapper<Account> {}

let ds: DataSource;
let mapper: AccountMapper;

beforeAll(async () => {
  ds = createDataSource({ type: 'sqlite', database: ':memory:' });
  setDefaultDataSource(ds);
  await ds.execute(`
    CREATE TABLE account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0
    )
  `, []);
  mapper = new AccountMapper(Account, ds);
});

afterAll(async () => {
  await ds.close();
});

beforeEach(async () => {
  await ds.execute('DELETE FROM account', []);
  await mapper.insertBatch([
    { name: 'Alice', balance: 100 },
    { name: 'Bob', balance: 200 },
  ]);
});

describe('Transaction - SQLite Integration', () => {
  // ============ ds.transaction (编程式) ============

  describe('ds.transaction (programmatic)', () => {
    it('commits on success', async () => {
      await ds.transaction(async () => {
        await mapper.insert({ name: 'Charlie', balance: 300 });
      });
      const count = await mapper.selectCount();
      expect(count).toBe(3);
    });

    it('rolls back on error', async () => {
      await expect(
        ds.transaction(async () => {
          await mapper.insert({ name: 'Charlie', balance: 300 });
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      const count = await mapper.selectCount();
      expect(count).toBe(2); // rollback, Charlie not inserted
    });
  });

  // ============ withTransaction (AsyncLocalStorage) ============

  describe('withTransaction (AsyncLocalStorage)', () => {
    it('commits on success', async () => {
      await withTransaction(ds, async () => {
        await mapper.insert({ name: 'Dave', balance: 400 });
        await mapper.lambdaUpdate().set('balance', 150).eq('name', 'Alice').execute();
      });
      const count = await mapper.selectCount();
      expect(count).toBe(3);
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Alice'));
      expect(alice!.balance).toBe(150);
    });

    it('rolls back on error', async () => {
      await expect(
        withTransaction(ds, async () => {
          await mapper.insert({ name: 'Dave', balance: 400 });
          await mapper.lambdaUpdate().set('balance', 0).eq('name', 'Alice').execute();
          throw new Error('fail');
        })
      ).rejects.toThrow('fail');
      const count = await mapper.selectCount();
      expect(count).toBe(2);
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Alice'));
      expect(alice!.balance).toBe(100); // unchanged
    });

    it('nested withTransaction reuses connection (propagation)', async () => {
      await withTransaction(ds, async () => {
        await mapper.insert({ name: 'Outer', balance: 1 });
        // nested — should reuse same tx
        await withTransaction(ds, async () => {
          await mapper.insert({ name: 'Inner', balance: 2 });
        });
      });
      const count = await mapper.selectCount();
      expect(count).toBe(4); // Alice, Bob, Outer, Inner
    });

    it('nested withTransaction rolls back everything on outer error', async () => {
      await expect(
        withTransaction(ds, async () => {
          await mapper.insert({ name: 'Outer', balance: 1 });
          await withTransaction(ds, async () => {
            await mapper.insert({ name: 'Inner', balance: 2 });
          });
          throw new Error('outer fail');
        })
      ).rejects.toThrow('outer fail');
      const count = await mapper.selectCount();
      expect(count).toBe(2); // only Alice, Bob
    });
  });

  // ============ @Transactional 装饰器 ============

  describe('@Transactional decorator', () => {
    class AccountService {
      @Transactional()
      async transfer(from: string, to: string, amount: number) {
        const fromAccount = await mapper.selectOne(mapper.lambdaQuery().eq('name', from));
        const toAccount = await mapper.selectOne(mapper.lambdaQuery().eq('name', to));
        if (!fromAccount || !toAccount) throw new Error('Account not found');
        if (fromAccount.balance < amount) throw new Error('Insufficient balance');
        await mapper.lambdaUpdate().set('balance', fromAccount.balance - amount).eq('name', from).execute();
        await mapper.lambdaUpdate().set('balance', toAccount.balance + amount).eq('name', to).execute();
      }

      @Transactional()
      async transferAndFail(from: string, to: string, amount: number) {
        const fromAccount = await mapper.selectOne(mapper.lambdaQuery().eq('name', from));
        const toAccount = await mapper.selectOne(mapper.lambdaQuery().eq('name', to));
        if (!fromAccount || !toAccount) throw new Error('Account not found');
        await mapper.lambdaUpdate().set('balance', fromAccount.balance - amount).eq('name', from).execute();
        // Simulate failure after deducting but before crediting
        throw new Error('transfer failed');
      }

      @Transactional()
      async createAccount(name: string, balance: number) {
        await mapper.insert({ name, balance });
      }
    }

    const service = new AccountService();

    it('commits successful transfer', async () => {
      await service.transfer('Alice', 'Bob', 50);
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Alice'));
      const bob = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Bob'));
      expect(alice!.balance).toBe(50);
      expect(bob!.balance).toBe(250);
    });

    it('rolls back failed transfer', async () => {
      await expect(service.transferAndFail('Alice', 'Bob', 50)).rejects.toThrow('transfer failed');
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Alice'));
      const bob = await mapper.selectOne(mapper.lambdaQuery().eq('name', 'Bob'));
      expect(alice!.balance).toBe(100); // unchanged
      expect(bob!.balance).toBe(200);   // unchanged
    });

    it('simple @Transactional insert commits', async () => {
      await service.createAccount('Eve', 500);
      const count = await mapper.selectCount();
      expect(count).toBe(3);
    });
  });

  // ============ @Transactional without datasource ============

  describe('@Transactional error cases', () => {
    it('throws when no datasource set', async () => {
      // Temporarily clear default datasource
      const { setDefaultDataSource: setDs } = await import('../src/core/transaction');
      setDs(null as any);

      class BadService {
        @Transactional()
        async doSomething() {
          // should not reach here
        }
      }
      const svc = new BadService();
      await expect(svc.doSomething()).rejects.toThrow('No DataSource');

      // Restore
      setDs(ds);
    });
  });
});
