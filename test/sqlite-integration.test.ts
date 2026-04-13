import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id } from '../src/decorator';
import { BaseMapper } from '../src/mapper/base-mapper';
import { createDataSource } from '../src/core/datasource';
import type { DataSource } from '../src/types';

// ============ 实体定义 ============

@Table('user')
class User {
  @Id({ type: 'auto' }) id!: number;
  @Column('user_name') userName!: string;
  @Column() age!: number;
  @Column() email!: string;
}

class UserMapper extends BaseMapper<User> {}

// ============ 测试 ============

let ds: DataSource;
let mapper: UserMapper;

beforeAll(async () => {
  ds = createDataSource({ type: 'sqlite', database: ':memory:' });
  await ds.execute(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      email TEXT
    )
  `, []);
  mapper = new UserMapper(User, ds);
});

afterAll(async () => {
  await ds.close();
});

beforeEach(async () => {
  await ds.execute('DELETE FROM user', []);
});

describe('BaseMapper CRUD - SQLite Integration', () => {
  // ============ INSERT ============

  describe('insert', () => {
    it('inserts single entity and returns id', async () => {
      const id = await mapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
      expect(id).toBeGreaterThan(0);
    });

    it('inserts entity without optional fields', async () => {
      const id = await mapper.insert({ userName: '李四', age: 25 } as any);
      expect(id).toBeGreaterThan(0);
    });

    it('insertBatch inserts multiple entities', async () => {
      const count = await mapper.insertBatch([
        { userName: 'a', age: 1, email: 'a@t.com' },
        { userName: 'b', age: 2, email: 'b@t.com' },
        { userName: 'c', age: 3, email: 'c@t.com' },
      ]);
      expect(count).toBe(3);
      const list = await mapper.selectList();
      expect(list).toHaveLength(3);
    });

    it('insertBatch with empty array returns 0', async () => {
      const count = await mapper.insertBatch([]);
      expect(count).toBe(0);
    });
  });

  // ============ SELECT ============

  describe('select', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
        { userName: '王五', age: 30, email: 'ww@test.com' },
        { userName: '赵六', age: 35, email: null as any },
      ]);
    });

    it('selectById returns entity', async () => {
      const list = await mapper.selectList();
      const user = await mapper.selectById(list[0].id);
      expect(user).not.toBeNull();
      expect(user!.user_name).toBe('张三');
    });

    it('selectById returns null for non-existent id', async () => {
      const user = await mapper.selectById(99999);
      expect(user).toBeNull();
    });

    it('selectBatchIds returns matching entities', async () => {
      const all = await mapper.selectList();
      const ids = [all[0].id, all[2].id];
      const users = await mapper.selectBatchIds(ids);
      expect(users).toHaveLength(2);
    });

    it('selectBatchIds with empty array returns empty', async () => {
      const users = await mapper.selectBatchIds([]);
      expect(users).toEqual([]);
    });

    it('selectList returns all', async () => {
      const list = await mapper.selectList();
      expect(list).toHaveLength(4);
    });

    it('selectList with wrapper filters', async () => {
      const list = await mapper.selectList(
        mapper.lambdaQuery().ge('age', 25)
      );
      expect(list).toHaveLength(3);
    });

    it('selectCount returns total', async () => {
      const count = await mapper.selectCount();
      expect(count).toBe(4);
    });

    it('selectCount with wrapper', async () => {
      const count = await mapper.selectCount(
        mapper.lambdaQuery().eq('userName', '张三')
      );
      expect(count).toBe(1);
    });

    it('selectOne returns first match', async () => {
      const user = await mapper.selectOne(
        mapper.lambdaQuery().eq('userName', '李四')
      );
      expect(user).not.toBeNull();
      expect(user!.user_name).toBe('李四');
    });

    it('selectOne returns null when no match', async () => {
      const user = await mapper.selectOne(
        mapper.lambdaQuery().eq('userName', '不存在')
      );
      expect(user).toBeNull();
    });
  });

  // ============ Lambda Query 链式 ============

  describe('lambdaQuery chain', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: 'alice', age: 20, email: 'alice@gmail.com' },
        { userName: 'bob', age: 25, email: 'bob@test.com' },
        { userName: 'charlie', age: 30, email: 'charlie@gmail.com' },
        { userName: 'dave', age: 35, email: null as any },
        { userName: 'eve', age: 20, email: 'eve@gmail.com' },
      ]);
    });

    it('eq filter', async () => {
      const list = await mapper.lambdaQuery().eq('age', 20).list();
      expect(list).toHaveLength(2);
    });

    it('ne filter', async () => {
      const list = await mapper.lambdaQuery().ne('age', 20).list();
      expect(list).toHaveLength(3);
    });

    it('gt filter', async () => {
      const list = await mapper.lambdaQuery().gt('age', 25).list();
      expect(list).toHaveLength(2);
    });

    it('ge filter', async () => {
      const list = await mapper.lambdaQuery().ge('age', 25).list();
      expect(list).toHaveLength(3);
    });

    it('lt filter', async () => {
      const list = await mapper.lambdaQuery().lt('age', 25).list();
      expect(list).toHaveLength(2);
    });

    it('le filter', async () => {
      const list = await mapper.lambdaQuery().le('age', 25).list();
      expect(list).toHaveLength(3);
    });

    it('like filter', async () => {
      const list = await mapper.lambdaQuery().like('email', 'gmail').list();
      expect(list).toHaveLength(3);
    });

    it('likeLeft filter', async () => {
      const list = await mapper.lambdaQuery().likeLeft('email', 'gmail.com').list();
      expect(list).toHaveLength(3);
    });

    it('likeRight filter', async () => {
      const list = await mapper.lambdaQuery().likeRight('userName', 'ali').list();
      expect(list).toHaveLength(1);
    });

    it('between filter', async () => {
      const list = await mapper.lambdaQuery().between('age', 25, 35).list();
      expect(list).toHaveLength(3);
    });

    it('in filter', async () => {
      const list = await mapper.lambdaQuery().in('age', [20, 30]).list();
      expect(list).toHaveLength(3);
    });

    it('notIn filter', async () => {
      const list = await mapper.lambdaQuery().notIn('age', [20, 30]).list();
      expect(list).toHaveLength(2);
    });

    it('isNull filter', async () => {
      const list = await mapper.lambdaQuery().isNull('email').list();
      expect(list).toHaveLength(1);
      expect(list[0].user_name).toBe('dave');
    });

    it('isNotNull filter', async () => {
      const list = await mapper.lambdaQuery().isNotNull('email').list();
      expect(list).toHaveLength(4);
    });

    it('or nested', async () => {
      const list = await mapper.lambdaQuery()
        .ge('age', 30)
        .or(q => q.eq('userName', 'alice').eq('userName', 'bob'))
        .list();
      // age>=30: charlie(30), dave(35) + (alice OR bob) — but this is AND with OR group
      // Actually: age>=30 AND (userName=alice OR userName=bob)
      // charlie(30) and dave(35) don't match userName, alice(20) doesn't match age>=30
      // So result should be 0
      expect(list).toHaveLength(0);
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

    it('selectPage returns page result', async () => {
      const page = await mapper.selectPage(1, 2);
      expect(page.records).toHaveLength(2);
      expect(page.total).toBe(5);
      expect(page.page).toBe(1);
      expect(page.size).toBe(2);
      expect(page.pages).toBe(3);
    });

    it('dynamic conditions skip null values', async () => {
      const name: string | null = 'alice';
      const age: number | null = null;
      const list = await mapper.lambdaQuery()
        .eq(name != null, 'userName', name)
        .ge(age != null, 'age', age)
        .list();
      expect(list).toHaveLength(1);
      expect(list[0].user_name).toBe('alice');
    });

    it('all dynamic conditions false returns all', async () => {
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
      expect(list).toHaveLength(3); // alice(20,gmail), charlie(30,gmail), eve(20,gmail)
      expect(list[0].user_name).toBe('alice');
      expect(list[1].user_name).toBe('eve');
      expect(list[2].user_name).toBe('charlie');
    });
  });

  // ============ UPDATE ============

  describe('update', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
      ]);
    });

    it('updateById updates entity', async () => {
      const all = await mapper.selectList();
      const id = all[0].id;
      const affected = await mapper.updateById({ id, age: 21 } as any);
      expect(affected).toBe(1);
      const updated = await mapper.selectById(id);
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
      const wrapper = mapper.lambdaQuery().eq('userName', '张三');
      const affected = await mapper.update({ age: 99 } as any, wrapper);
      expect(affected).toBe(1);
      const user = await mapper.selectOne(mapper.lambdaQuery().eq('userName', '张三'));
      expect(user!.age).toBe(99);
    });

    it('lambdaUpdate set + execute', async () => {
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
      const newEmail = 'new@test.com';
      const affected = await mapper.lambdaUpdate()
        .set(newAge != null, 'age', newAge)
        .set(newEmail != null, 'email', newEmail)
        .eq('userName', '张三')
        .execute();
      expect(affected).toBe(1);
      const user = await mapper.selectOne(mapper.lambdaQuery().eq('userName', '张三'));
      expect(user!.email).toBe('new@test.com');
      expect(user!.age).toBe(20); // unchanged
    });
  });

  // ============ DELETE ============

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
      const affected = await mapper.deleteById(all[0].id);
      expect(affected).toBe(1);
      const remaining = await mapper.selectList();
      expect(remaining).toHaveLength(2);
    });

    it('deleteBatchIds', async () => {
      const all = await mapper.selectList();
      const affected = await mapper.deleteBatchIds([all[0].id, all[1].id]);
      expect(affected).toBe(2);
      const remaining = await mapper.selectList();
      expect(remaining).toHaveLength(1);
    });

    it('deleteBatchIds with empty array', async () => {
      const affected = await mapper.deleteBatchIds([]);
      expect(affected).toBe(0);
    });

    it('delete with wrapper', async () => {
      const wrapper = mapper.lambdaQuery().ge('age', 25);
      const affected = await mapper.delete(wrapper);
      expect(affected).toBe(2);
      const remaining = await mapper.selectList();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].user_name).toBe('张三');
    });
  });

  // ============ rawQuery ============

  describe('rawQuery', () => {
    beforeEach(async () => {
      await mapper.insertBatch([
        { userName: '张三', age: 20, email: 'zs@test.com' },
        { userName: '李四', age: 25, email: 'ls@test.com' },
      ]);
    });

    it('executes raw SQL with named params', async () => {
      const rows = await mapper.rawQuery(
        'SELECT * FROM user WHERE age > #{age}',
        { age: 18 }
      );
      expect(rows).toHaveLength(2);
    });

    it('executes raw SQL with multiple params', async () => {
      const rows = await mapper.rawQuery(
        'SELECT * FROM user WHERE user_name = #{name} AND age = #{age}',
        { name: '张三', age: 20 }
      );
      expect(rows).toHaveLength(1);
    });

    it('executes raw SQL without params', async () => {
      const rows = await mapper.rawQuery('SELECT COUNT(*) AS total FROM user');
      expect(Number(rows[0].total)).toBe(2);
    });
  });
});
