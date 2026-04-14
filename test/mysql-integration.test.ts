import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id } from '../src/decorator';
import { BaseMapper } from '../src/mapper/base-mapper';
import { createDataSource } from '../src/core/datasource';
import { withTransaction, setDefaultDataSource, Transactional } from '../src/core/transaction';
import type { DataSource } from '../src/types';

// ============ 实体 ============

@Table('mybatis_plus_test')
class TestUser {
  @Id({ type: 'auto' }) id!: number;
  @Column('user_name') userName!: string;
  @Column() age!: number;
  @Column() email!: string;
}

class TestUserMapper extends BaseMapper<TestUser> {}

// ============ 连接配置 ============

let ds: DataSource;
let mapper: TestUserMapper;

beforeAll(() => {
  ds = createDataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    username: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'test',
    pool: { min: 2, max: 5 },
  });
  setDefaultDataSource(ds);
  mapper = new TestUserMapper(TestUser, ds);
});

afterAll(async () => {
  await ds.execute('DELETE FROM mybatis_plus_test', []);
  await ds.close();
});

beforeEach(async () => {
  await ds.execute('DELETE FROM mybatis_plus_test', []);
});

// ============ 测试 ============

describe('MySQL Integration', () => {

  // ---- INSERT ----

  describe('insert', () => {
    it('inserts single entity and returns auto-increment id', async () => {
      const id = await mapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
      expect(id).toBeGreaterThan(0);
    });

    it('insertBatch inserts multiple rows', async () => {
      const count = await mapper.insertBatch([
        { userName: 'a', age: 1, email: 'a@t.com' },
        { userName: 'b', age: 2, email: 'b@t.com' },
        { userName: 'c', age: 3, email: 'c@t.com' },
      ]);
      expect(count).toBe(3);
      const list = await mapper.selectList();
      expect(list).toHaveLength(3);
    });

    it('insertBatch empty returns 0', async () => {
      expect(await mapper.insertBatch([])).toBe(0);
    });

    it('inserts entity without optional fields', async () => {
      const id = await mapper.insert({ userName: '李四', age: 25 } as any);
      expect(id).toBeGreaterThan(0);
    });
  });

  // ---- SELECT ----

  describe('select', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
        { userName: '王五', age: 30, email: 'ww@test.com' },
        { userName: '赵六', age: 35, email: null as any },
      ]);
    });

    it('selectById', async () => {
      const all = await mapper.selectList();
      const user = await mapper.selectById(all[0].id);
      expect(user).not.toBeNull();
      expect(user!.user_name).toBe('张三');
    });

    it('selectById returns null for non-existent', async () => {
      expect(await mapper.selectById(999999999)).toBeNull();
    });

    it('selectBatchIds', async () => {
      const all = await mapper.selectList();
      const users = await mapper.selectBatchIds([all[0].id, all[2].id]);
      expect(users).toHaveLength(2);
    });

    it('selectBatchIds with empty array returns empty', async () => {
      expect(await mapper.selectBatchIds([])).toEqual([]);
    });

    it('selectList returns all', async () => {
      expect(await mapper.selectList()).toHaveLength(4);
    });

    it('selectList with wrapper', async () => {
      const list = await mapper.selectList(mapper.lambdaQuery().ge('age', 25));
      expect(list).toHaveLength(3);
    });

    it('selectCount', async () => {
      expect(await mapper.selectCount()).toBe(4);
    });

    it('selectCount with wrapper', async () => {
      expect(await mapper.selectCount(mapper.lambdaQuery().eq('userName', '张三'))).toBe(1);
    });

    it('selectOne', async () => {
      const user = await mapper.selectOne(mapper.lambdaQuery().eq('userName', '李四'));
      expect(user).not.toBeNull();
      expect(user!.user_name).toBe('李四');
    });

    it('selectOne returns null', async () => {
      expect(await mapper.selectOne(mapper.lambdaQuery().eq('userName', '不存在'))).toBeNull();
    });
  });

  // ---- Lambda Query 全操作符 ----

  describe('lambdaQuery operators', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: 'alice', age: 20, email: 'alice@gmail.com' },
        { userName: 'bob', age: 25, email: 'bob@test.com' },
        { userName: 'charlie', age: 30, email: 'charlie@gmail.com' },
        { userName: 'dave', age: 35, email: null as any },
        { userName: 'eve', age: 20, email: 'eve@gmail.com' },
      ]);
    });

    it('eq', async () => {
      expect(await mapper.lambdaQuery().eq('age', 20).list()).toHaveLength(2);
    });

    it('ne', async () => {
      expect(await mapper.lambdaQuery().ne('age', 20).list()).toHaveLength(3);
    });

    it('gt', async () => {
      expect(await mapper.lambdaQuery().gt('age', 25).list()).toHaveLength(2);
    });

    it('ge', async () => {
      expect(await mapper.lambdaQuery().ge('age', 25).list()).toHaveLength(3);
    });

    it('lt', async () => {
      expect(await mapper.lambdaQuery().lt('age', 25).list()).toHaveLength(2);
    });

    it('le', async () => {
      expect(await mapper.lambdaQuery().le('age', 25).list()).toHaveLength(3);
    });

    it('like', async () => {
      expect(await mapper.lambdaQuery().like('email', 'gmail').list()).toHaveLength(3);
    });

    it('likeLeft', async () => {
      expect(await mapper.lambdaQuery().likeLeft('email', 'gmail.com').list()).toHaveLength(3);
    });

    it('likeRight', async () => {
      expect(await mapper.lambdaQuery().likeRight('userName', 'ali').list()).toHaveLength(1);
    });

    it('between', async () => {
      expect(await mapper.lambdaQuery().between('age', 25, 35).list()).toHaveLength(3);
    });

    it('in', async () => {
      expect(await mapper.lambdaQuery().in('age', [20, 30]).list()).toHaveLength(3);
    });

    it('notIn', async () => {
      expect(await mapper.lambdaQuery().notIn('age', [20, 30]).list()).toHaveLength(2);
    });

    it('isNull', async () => {
      const list = await mapper.lambdaQuery().isNull('email').list();
      expect(list).toHaveLength(1);
      expect(list[0].user_name).toBe('dave');
    });

    it('isNotNull', async () => {
      expect(await mapper.lambdaQuery().isNotNull('email').list()).toHaveLength(4);
    });

    it('or nested', async () => {
      const list = await mapper.lambdaQuery()
        .eq('age', 20)
        .or(q => q.eq('userName', 'alice').eq('userName', 'eve'))
        .list();
      expect(list).toHaveLength(2);
    });

    it('orderByAsc', async () => {
      const list = await mapper.lambdaQuery().orderByAsc('age').list();
      expect(list[0].age).toBe(20);
      expect(list[list.length - 1].age).toBe(35);
    });

    it('orderByDesc', async () => {
      const list = await mapper.lambdaQuery().orderByDesc('age').list();
      expect(list[0].age).toBe(35);
    });

    it('page', async () => {
      const list = await mapper.lambdaQuery().orderByAsc('age').page(1, 2).list();
      expect(list).toHaveLength(2);
    });

    it('page 2', async () => {
      const list = await mapper.lambdaQuery().orderByAsc('age').page(2, 2).list();
      expect(list).toHaveLength(2);
      expect(list[0].age).toBe(25);
    });

    it('selectPage', async () => {
      const page = await mapper.selectPage(1, 2);
      expect(page.records).toHaveLength(2);
      expect(page.total).toBe(5);
      expect(page.pages).toBe(3);
    });

    it('dynamic conditions', async () => {
      const name: string | null = 'alice';
      const age: number | null = null;
      const list = await mapper.lambdaQuery()
        .eq(name != null, 'userName', name)
        .ge(age != null, 'age', age)
        .list();
      expect(list).toHaveLength(1);
    });

    it('all dynamic false returns all', async () => {
      const list = await mapper.lambdaQuery()
        .eq(false, 'userName', 'x')
        .ge(false, 'age', 999)
        .list();
      expect(list).toHaveLength(5);
    });

    it('complex chain', async () => {
      const list = await mapper.lambdaQuery()
        .ge('age', 20)
        .le('age', 30)
        .like('email', 'gmail')
        .orderByAsc('age')
        .list();
      expect(list).toHaveLength(3);
    });
  });

  // ---- UPDATE ----

  describe('update', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
      ]);
    });

    it('updateById', async () => {
      const all = await mapper.selectList();
      const affected = await mapper.updateById({ id: all[0].id, age: 21 } as any);
      expect(affected).toBe(1);
      const updated = await mapper.selectById(all[0].id);
      expect(updated!.age).toBe(21);
    });

    it('updateById throws without id', async () => {
      await expect(mapper.updateById({ age: 21 } as any)).rejects.toThrow('id value');
    });

    it('updateById throws with no fields', async () => {
      const all = await mapper.selectList();
      await expect(mapper.updateById({ id: all[0].id } as any)).rejects.toThrow('No fields');
    });

    it('update with wrapper', async () => {
      const affected = await mapper.update(
        { age: 99 } as any,
        mapper.lambdaQuery().eq('userName', '张三')
      );
      expect(affected).toBe(1);
    });

    it('lambdaUpdate', async () => {
      const affected = await mapper.lambdaUpdate()
        .set('age', 50)
        .eq('userName', '李四')
        .execute();
      expect(affected).toBe(1);
      const user = await mapper.selectOne(mapper.lambdaQuery().eq('userName', '李四'));
      expect(user!.age).toBe(50);
    });

    it('lambdaUpdate dynamic set', async () => {
      const newAge: number | null = null;
      const affected = await mapper.lambdaUpdate()
        .set(newAge != null, 'age', newAge)
        .set('email', 'new@test.com')
        .eq('userName', '张三')
        .execute();
      expect(affected).toBe(1);
      const user = await mapper.selectOne(mapper.lambdaQuery().eq('userName', '张三'));
      expect(user!.email).toBe('new@test.com');
      expect(user!.age).toBe(20);
    });
  });

  // ---- DELETE ----

  describe('delete', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
        { userName: '王五', age: 30, email: 'ww@test.com' },
      ]);
    });

    it('deleteById', async () => {
      const all = await mapper.selectList();
      expect(await mapper.deleteById(all[0].id)).toBe(1);
      expect(await mapper.selectList()).toHaveLength(2);
    });

    it('deleteBatchIds', async () => {
      const all = await mapper.selectList();
      expect(await mapper.deleteBatchIds([all[0].id, all[1].id])).toBe(2);
      expect(await mapper.selectList()).toHaveLength(1);
    });

    it('deleteBatchIds with empty array', async () => {
      expect(await mapper.deleteBatchIds([])).toBe(0);
    });

    it('delete with wrapper', async () => {
      expect(await mapper.delete(mapper.lambdaQuery().ge('age', 25))).toBe(2);
      const remaining = await mapper.selectList();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].user_name).toBe('张三');
    });
  });

  // ---- rawQuery ----

  describe('rawQuery', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
      ]);
    });

    it('named params', async () => {
      const rows = await mapper.rawQuery(
        'SELECT * FROM mybatis_plus_test WHERE age > #{age}',
        { age: 18 }
      );
      expect(rows).toHaveLength(2);
    });

    it('multiple named params', async () => {
      const rows = await mapper.rawQuery(
        'SELECT * FROM mybatis_plus_test WHERE user_name = #{name} AND age = #{age}',
        { name: '张三', age: 20 }
      );
      expect(rows).toHaveLength(1);
    });

    it('no params', async () => {
      const rows = await mapper.rawQuery('SELECT COUNT(*) AS total FROM mybatis_plus_test');
      expect(Number(rows[0].total)).toBe(2);
    });
  });

  // ---- 事务 ----

  describe('transaction', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: 'Alice', age: 100, email: 'a@t.com' },
        { userName: 'Bob', age: 200, email: 'b@t.com' },
      ]);
    });

    it('ds.transaction commits on success', async () => {
      await ds.transaction(async (tx) => {
        // 直接用事务连接执行
        await tx.connection.query(
          'INSERT INTO mybatis_plus_test (user_name, age, email) VALUES (?, ?, ?)',
          ['Charlie', 300, 'c@t.com']
        );
      });
      expect(await mapper.selectCount()).toBe(3);
    });

    it('ds.transaction rolls back on error', async () => {
      await expect(
        ds.transaction(async (tx) => {
          await tx.connection.query(
            'INSERT INTO mybatis_plus_test (user_name, age, email) VALUES (?, ?, ?)',
            ['Charlie', 300, 'c@t.com']
          );
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(await mapper.selectCount()).toBe(2);
    });

    it('withTransaction commits', async () => {
      await withTransaction(ds, async () => {
        await mapper.insert({ userName: 'Dave', age: 400, email: 'd@t.com' });
        await mapper.lambdaUpdate().set('age', 150).eq('userName', 'Alice').execute();
      });
      expect(await mapper.selectCount()).toBe(3);
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('userName', 'Alice'));
      expect(alice!.age).toBe(150);
    });

    it('withTransaction rolls back on error', async () => {
      await expect(
        withTransaction(ds, async () => {
          await mapper.lambdaUpdate().set('age', 0).eq('userName', 'Alice').execute();
          throw new Error('fail');
        })
      ).rejects.toThrow('fail');
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('userName', 'Alice'));
      expect(alice!.age).toBe(100);
    });

    it('@Transactional commits', async () => {
      class Svc {
        @Transactional()
        async run() {
          await mapper.insert({ userName: 'Eve', age: 500, email: 'e@t.com' });
          await mapper.lambdaUpdate().set('age', 999).eq('userName', 'Bob').execute();
        }
      }
      await new Svc().run();
      expect(await mapper.selectCount()).toBe(3);
      const bob = await mapper.selectOne(mapper.lambdaQuery().eq('userName', 'Bob'));
      expect(bob!.age).toBe(999);
    });

    it('@Transactional rolls back on error', async () => {
      class Svc {
        @Transactional()
        async run() {
          await mapper.lambdaUpdate().set('age', 0).eq('userName', 'Alice').execute();
          throw new Error('tx fail');
        }
      }
      await expect(new Svc().run()).rejects.toThrow('tx fail');
      const alice = await mapper.selectOne(mapper.lambdaQuery().eq('userName', 'Alice'));
      expect(alice!.age).toBe(100);
    });
  });
});
