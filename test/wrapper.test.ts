import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id, getEntityMeta } from '../src/decorator';
import { LambdaQueryWrapper } from '../src/wrapper/query-wrapper';
import { LambdaUpdateWrapper } from '../src/wrapper/update-wrapper';
import { SqlBuilder } from '../src/builder/sql-builder';
import { MysqlDialect } from '../src/dialect';

// 测试实体
@Table('sys_user')
class User {
  @Id({ type: 'auto' }) id!: number;
  @Column('user_name') userName!: string;
  @Column() age!: number;
  @Column('email_addr') email!: string;
}

const meta = getEntityMeta(User);
const dialect = new MysqlDialect();
const build = (wrapper: LambdaQueryWrapper<User>) => {
  const node = wrapper.buildSelectNode();
  return new SqlBuilder(dialect).build(node);
};
const buildUpdate = (wrapper: LambdaUpdateWrapper<User>) => {
  const node = wrapper.buildUpdateNode();
  return new SqlBuilder(dialect).build(node);
};

describe('LambdaQueryWrapper', () => {
  // ---- 基本条件 ----

  it('eq', () => {
    const w = new LambdaQueryWrapper<User>(meta).eq('userName', '张三');
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user` WHERE `user_name` = ?');
    expect(params).toEqual(['张三']);
  });

  it('ne', () => {
    const w = new LambdaQueryWrapper<User>(meta).ne('age', 0);
    const { sql, params } = build(w);
    expect(sql).toContain('`age` != ?');
    expect(params).toEqual([0]);
  });

  it('gt', () => {
    const w = new LambdaQueryWrapper<User>(meta).gt('age', 18);
    const { sql } = build(w);
    expect(sql).toContain('`age` > ?');
  });

  it('ge', () => {
    const w = new LambdaQueryWrapper<User>(meta).ge('age', 18);
    const { sql } = build(w);
    expect(sql).toContain('`age` >= ?');
  });

  it('lt', () => {
    const w = new LambdaQueryWrapper<User>(meta).lt('age', 60);
    const { sql } = build(w);
    expect(sql).toContain('`age` < ?');
  });

  it('le', () => {
    const w = new LambdaQueryWrapper<User>(meta).le('age', 60);
    const { sql } = build(w);
    expect(sql).toContain('`age` <= ?');
  });

  it('like (full)', () => {
    const w = new LambdaQueryWrapper<User>(meta).like('userName', 'test');
    const { sql, params } = build(w);
    expect(sql).toContain('`user_name` LIKE ?');
    expect(params).toEqual(['%test%']);
  });

  it('likeLeft', () => {
    const w = new LambdaQueryWrapper<User>(meta).likeLeft('userName', 'test');
    const { params } = build(w);
    expect(params).toEqual(['%test']);
  });

  it('likeRight', () => {
    const w = new LambdaQueryWrapper<User>(meta).likeRight('userName', 'test');
    const { params } = build(w);
    expect(params).toEqual(['test%']);
  });

  it('between', () => {
    const w = new LambdaQueryWrapper<User>(meta).between('age', 18, 30);
    const { sql, params } = build(w);
    expect(sql).toContain('`age` BETWEEN ? AND ?');
    expect(params).toEqual([18, 30]);
  });

  it('in', () => {
    const w = new LambdaQueryWrapper<User>(meta).in('id', [1, 2, 3]);
    const { sql, params } = build(w);
    expect(sql).toContain('`id` IN (?, ?, ?)');
    expect(params).toEqual([1, 2, 3]);
  });

  it('notIn', () => {
    const w = new LambdaQueryWrapper<User>(meta).notIn('id', [4, 5]);
    const { sql, params } = build(w);
    expect(sql).toContain('`id` NOT IN (?, ?)');
    expect(params).toEqual([4, 5]);
  });

  it('isNull', () => {
    const w = new LambdaQueryWrapper<User>(meta).isNull('email');
    const { sql } = build(w);
    expect(sql).toContain('`email_addr` IS NULL');
  });

  it('isNotNull', () => {
    const w = new LambdaQueryWrapper<User>(meta).isNotNull('email');
    const { sql } = build(w);
    expect(sql).toContain('`email_addr` IS NOT NULL');
  });

  // ---- 链式组合 ----

  it('chains multiple conditions with AND', () => {
    const w = new LambdaQueryWrapper<User>(meta)
      .eq('userName', '张三')
      .ge('age', 18)
      .isNotNull('email');
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user` WHERE `user_name` = ? AND `age` >= ? AND `email_addr` IS NOT NULL');
    expect(params).toEqual(['张三', 18]);
  });

  // ---- OR 嵌套 ----

  it('or nested group', () => {
    const w = new LambdaQueryWrapper<User>(meta)
      .eq('age', 20)
      .or(q => q.eq('userName', 'a').eq('userName', 'b'));
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user` WHERE `age` = ? AND (`user_name` = ? OR `user_name` = ?)');
    expect(params).toEqual([20, 'a', 'b']);
  });

  it('and nested group', () => {
    const w = new LambdaQueryWrapper<User>(meta)
      .and(q => q.ge('age', 18).le('age', 30));
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user` WHERE (`age` >= ? AND `age` <= ?)');
    expect(params).toEqual([18, 30]);
  });

  // ---- 动态条件（boolean 重载） ----

  it('dynamic condition: true includes condition', () => {
    const w = new LambdaQueryWrapper<User>(meta).eq(true, 'userName', '张三');
    const { sql, params } = build(w);
    expect(sql).toContain('`user_name` = ?');
    expect(params).toEqual(['张三']);
  });

  it('dynamic condition: false skips condition', () => {
    const w = new LambdaQueryWrapper<User>(meta).eq(false, 'userName', '张三');
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user`');
    expect(params).toEqual([]);
  });

  it('dynamic condition on multiple operators', () => {
    const name: string | null = '张三';
    const age: number | null = null;
    const w = new LambdaQueryWrapper<User>(meta)
      .eq(name != null, 'userName', name)
      .ge(age != null, 'age', age);
    const { sql, params } = build(w);
    expect(sql).toBe('SELECT * FROM `sys_user` WHERE `user_name` = ?');
    expect(params).toEqual(['张三']);
  });

  it('dynamic like', () => {
    const w = new LambdaQueryWrapper<User>(meta).like(false, 'userName', 'x');
    const { params } = build(w);
    expect(params).toEqual([]);
  });

  it('dynamic between', () => {
    const w = new LambdaQueryWrapper<User>(meta).between(false, 'age', 1, 2);
    const { params } = build(w);
    expect(params).toEqual([]);
  });

  it('dynamic in', () => {
    const w = new LambdaQueryWrapper<User>(meta).in(false, 'id', [1, 2]);
    const { params } = build(w);
    expect(params).toEqual([]);
  });

  it('dynamic isNull', () => {
    const w = new LambdaQueryWrapper<User>(meta).isNull(false, 'email');
    const { sql } = build(w);
    expect(sql).not.toContain('IS NULL');
  });

  it('dynamic isNotNull', () => {
    const w = new LambdaQueryWrapper<User>(meta).isNotNull(false, 'email');
    const { sql } = build(w);
    expect(sql).not.toContain('IS NOT NULL');
  });

  // ---- select / orderBy / groupBy / page ----

  it('select specific columns', () => {
    const w = new LambdaQueryWrapper<User>(meta).select('userName', 'age');
    const { sql } = build(w);
    expect(sql).toBe('SELECT `user_name`, `age` FROM `sys_user`');
  });

  it('orderByAsc', () => {
    const w = new LambdaQueryWrapper<User>(meta).orderByAsc('age');
    const { sql } = build(w);
    expect(sql).toContain('ORDER BY `age` ASC');
  });

  it('orderByDesc', () => {
    const w = new LambdaQueryWrapper<User>(meta).orderByDesc('id');
    const { sql } = build(w);
    expect(sql).toContain('ORDER BY `id` DESC');
  });

  it('multiple orderBy', () => {
    const w = new LambdaQueryWrapper<User>(meta).orderByAsc('age').orderByDesc('id');
    const { sql } = build(w);
    expect(sql).toContain('ORDER BY `age` ASC, `id` DESC');
  });

  it('groupBy', () => {
    const w = new LambdaQueryWrapper<User>(meta).groupBy('age');
    const { sql } = build(w);
    expect(sql).toContain('GROUP BY `age`');
  });

  it('page', () => {
    const w = new LambdaQueryWrapper<User>(meta).page(2, 10);
    const { sql } = build(w);
    expect(sql).toContain('LIMIT 10 OFFSET 10');
  });

  it('page 1', () => {
    const w = new LambdaQueryWrapper<User>(meta).page(1, 20);
    const { sql } = build(w);
    expect(sql).toContain('LIMIT 20 OFFSET 0');
  });

  // ---- 复杂组合 ----

  it('full complex query', () => {
    const w = new LambdaQueryWrapper<User>(meta)
      .select('userName', 'age')
      .eq('userName', '张三')
      .ge('age', 18)
      .like('email', '@gmail')
      .or(q => q.eq('age', 25).eq('age', 30))
      .orderByDesc('id')
      .page(1, 10);
    const { sql, params } = build(w);
    expect(sql).toBe(
      'SELECT `user_name`, `age` FROM `sys_user` WHERE `user_name` = ? AND `age` >= ? AND `email_addr` LIKE ? AND (`age` = ? OR `age` = ?) ORDER BY `id` DESC LIMIT 10 OFFSET 0'
    );
    expect(params).toEqual(['张三', 18, '%@gmail%', 25, 30]);
  });
});

describe('LambdaUpdateWrapper', () => {
  it('set single field', () => {
    const w = new LambdaUpdateWrapper<User>(meta).set('age', 25).eq('id', 1);
    const { sql, params } = buildUpdate(w);
    expect(sql).toBe('UPDATE `sys_user` SET `age` = ? WHERE `id` = ?');
    expect(params).toEqual([25, 1]);
  });

  it('set multiple fields', () => {
    const w = new LambdaUpdateWrapper<User>(meta)
      .set('userName', 'new')
      .set('age', 30)
      .eq('id', 1);
    const { sql, params } = buildUpdate(w);
    expect(sql).toBe('UPDATE `sys_user` SET `user_name` = ?, `age` = ? WHERE `id` = ?');
    expect(params).toEqual(['new', 30, 1]);
  });

  it('dynamic set: true includes', () => {
    const w = new LambdaUpdateWrapper<User>(meta).set(true, 'age', 25).eq('id', 1);
    const { sql } = buildUpdate(w);
    expect(sql).toContain('SET `age` = ?');
  });

  it('dynamic set: false skips', () => {
    const w = new LambdaUpdateWrapper<User>(meta).set(false, 'age', 25).set('userName', 'x').eq('id', 1);
    const { sql, params } = buildUpdate(w);
    expect(sql).toBe('UPDATE `sys_user` SET `user_name` = ? WHERE `id` = ?');
    expect(params).toEqual(['x', 1]);
  });

  it('update with complex where', () => {
    const w = new LambdaUpdateWrapper<User>(meta)
      .set('age', 0)
      .ge('age', 60)
      .isNotNull('email');
    const { sql, params } = buildUpdate(w);
    expect(sql).toBe('UPDATE `sys_user` SET `age` = ? WHERE `age` >= ? AND `email_addr` IS NOT NULL');
    expect(params).toEqual([0, 60]);
  });
});
