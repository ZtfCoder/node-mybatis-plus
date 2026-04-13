import { describe, it, expect } from 'vitest';
import { SqlBuilder } from '../src/builder/sql-builder';
import { MysqlDialect, PostgresDialect, SqliteDialect } from '../src/dialect';
import type { SelectNode, InsertNode, UpdateNode, DeleteNode } from '../src/types';

const mysqlBuilder = () => new SqlBuilder(new MysqlDialect());
const pgBuilder = () => new SqlBuilder(new PostgresDialect());
const sqliteBuilder = () => new SqlBuilder(new SqliteDialect());

describe('SqlBuilder', () => {
  // ============ SELECT ============

  describe('SELECT', () => {
    const baseSelect: SelectNode = {
      type: 'select', table: 'user', columns: [], where: null,
      orderBy: [], groupBy: [], having: null, limit: null,
    };

    it('builds SELECT * with no columns', () => {
      const { sql, params } = mysqlBuilder().build(baseSelect);
      expect(sql).toBe('SELECT * FROM `user`');
      expect(params).toEqual([]);
    });

    it('builds SELECT with specific columns', () => {
      const { sql } = mysqlBuilder().build({ ...baseSelect, columns: ['name', 'age'] });
      expect(sql).toBe('SELECT `name`, `age` FROM `user`');
    });

    it('builds WHERE with single condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'age', op: '>=', value: 18 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `age` >= ?');
      expect(params).toEqual([18]);
    });

    it('builds WHERE with multiple AND conditions', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: {
          logic: 'AND', items: [
            { column: 'name', op: '=', value: 'test' },
            { column: 'age', op: '>', value: 20 },
          ],
        },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `name` = ? AND `age` > ?');
      expect(params).toEqual(['test', 20]);
    });

    it('builds nested OR condition group', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: {
          logic: 'AND', items: [
            { column: 'status', op: '=', value: 1 },
            { logic: 'OR', items: [
              { column: 'name', op: '=', value: 'a' },
              { column: 'name', op: '=', value: 'b' },
            ]},
          ],
        },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `status` = ? AND (`name` = ? OR `name` = ?)');
      expect(params).toEqual([1, 'a', 'b']);
    });

    it('builds LIKE condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'name', op: 'LIKE', value: '%test%' }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `name` LIKE ?');
      expect(params).toEqual(['%test%']);
    });

    it('builds BETWEEN condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'age', op: 'BETWEEN', value: 18, value2: 30 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `age` BETWEEN ? AND ?');
      expect(params).toEqual([18, 30]);
    });

    it('builds IN condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'id', op: 'IN', value: [1, 2, 3] }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `id` IN (?, ?, ?)');
      expect(params).toEqual([1, 2, 3]);
    });

    it('builds NOT IN condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'id', op: 'NOT IN', value: [4, 5] }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `id` NOT IN (?, ?)');
      expect(params).toEqual([4, 5]);
    });

    it('builds IS NULL condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'email', op: 'IS NULL' }] },
      };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `email` IS NULL');
    });

    it('builds IS NOT NULL condition', () => {
      const node: SelectNode = {
        ...baseSelect,
        where: { logic: 'AND', items: [{ column: 'email', op: 'IS NOT NULL' }] },
      };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` WHERE `email` IS NOT NULL');
    });

    it('builds ORDER BY', () => {
      const node: SelectNode = {
        ...baseSelect,
        orderBy: [{ column: 'age', direction: 'ASC' }, { column: 'id', direction: 'DESC' }],
      };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` ORDER BY `age` ASC, `id` DESC');
    });

    it('builds GROUP BY', () => {
      const node: SelectNode = { ...baseSelect, groupBy: ['status'] };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` GROUP BY `status`');
    });

    it('builds GROUP BY + HAVING', () => {
      const node: SelectNode = {
        ...baseSelect,
        groupBy: ['status'],
        having: { logic: 'AND', items: [{ column: 'cnt', op: '>', value: 5 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` GROUP BY `status` HAVING `cnt` > ?');
      expect(params).toEqual([5]);
    });

    it('builds LIMIT/OFFSET (MySQL)', () => {
      const node: SelectNode = { ...baseSelect, limit: { offset: 10, count: 20 } };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT * FROM `user` LIMIT 20 OFFSET 10');
    });

    it('builds full complex SELECT', () => {
      const node: SelectNode = {
        type: 'select', table: 'user', columns: ['name', 'age'],
        where: {
          logic: 'AND', items: [
            { column: 'age', op: '>=', value: 18 },
            { column: 'status', op: '=', value: 1 },
          ],
        },
        orderBy: [{ column: 'age', direction: 'DESC' }],
        groupBy: [],
        having: null,
        limit: { offset: 0, count: 10 },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('SELECT `name`, `age` FROM `user` WHERE `age` >= ? AND `status` = ? ORDER BY `age` DESC LIMIT 10 OFFSET 0');
      expect(params).toEqual([18, 1]);
    });
  });

  // ============ INSERT ============

  describe('INSERT', () => {
    it('builds single row insert', () => {
      const node: InsertNode = {
        type: 'insert', table: 'user',
        columns: ['name', 'age'],
        values: [['test', 20]],
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('INSERT INTO `user` (`name`, `age`) VALUES (?, ?)');
      expect(params).toEqual(['test', 20]);
    });

    it('builds batch insert', () => {
      const node: InsertNode = {
        type: 'insert', table: 'user',
        columns: ['name', 'age'],
        values: [['a', 1], ['b', 2], ['c', 3]],
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('INSERT INTO `user` (`name`, `age`) VALUES (?, ?), (?, ?), (?, ?)');
      expect(params).toEqual(['a', 1, 'b', 2, 'c', 3]);
    });
  });

  // ============ UPDATE ============

  describe('UPDATE', () => {
    it('builds update with WHERE', () => {
      const node: UpdateNode = {
        type: 'update', table: 'user',
        sets: [{ column: 'age', value: 25 }],
        where: { logic: 'AND', items: [{ column: 'id', op: '=', value: 1 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('UPDATE `user` SET `age` = ? WHERE `id` = ?');
      expect(params).toEqual([25, 1]);
    });

    it('builds update with multiple sets', () => {
      const node: UpdateNode = {
        type: 'update', table: 'user',
        sets: [{ column: 'name', value: 'new' }, { column: 'age', value: 30 }],
        where: { logic: 'AND', items: [{ column: 'id', op: '=', value: 1 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('UPDATE `user` SET `name` = ?, `age` = ? WHERE `id` = ?');
      expect(params).toEqual(['new', 30, 1]);
    });

    it('builds update without WHERE', () => {
      const node: UpdateNode = {
        type: 'update', table: 'user',
        sets: [{ column: 'status', value: 0 }],
        where: null,
      };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('UPDATE `user` SET `status` = ?');
    });
  });

  // ============ DELETE ============

  describe('DELETE', () => {
    it('builds delete with WHERE', () => {
      const node: DeleteNode = {
        type: 'delete', table: 'user',
        where: { logic: 'AND', items: [{ column: 'id', op: '=', value: 1 }] },
      };
      const { sql, params } = mysqlBuilder().build(node);
      expect(sql).toBe('DELETE FROM `user` WHERE `id` = ?');
      expect(params).toEqual([1]);
    });

    it('builds delete without WHERE', () => {
      const node: DeleteNode = { type: 'delete', table: 'user', where: null };
      const { sql } = mysqlBuilder().build(node);
      expect(sql).toBe('DELETE FROM `user`');
    });
  });

  // ============ PostgreSQL 方言差异 ============

  describe('PostgreSQL dialect differences', () => {
    it('uses $N placeholders', () => {
      const node: SelectNode = {
        type: 'select', table: 'user', columns: [],
        where: {
          logic: 'AND', items: [
            { column: 'name', op: '=', value: 'test' },
            { column: 'age', op: '>', value: 18 },
          ],
        },
        orderBy: [], groupBy: [], having: null, limit: null,
      };
      const { sql, params } = pgBuilder().build(node);
      expect(sql).toBe('SELECT * FROM "user" WHERE "name" = $1 AND "age" > $2');
      expect(params).toEqual(['test', 18]);
    });

    it('uses double quotes for identifiers', () => {
      const node: InsertNode = {
        type: 'insert', table: 'user',
        columns: ['user_name'],
        values: [['test']],
      };
      const { sql } = pgBuilder().build(node);
      expect(sql).toBe('INSERT INTO "user" ("user_name") VALUES ($1)');
    });

    it('PG BETWEEN uses $N placeholders', () => {
      const node: SelectNode = {
        type: 'select', table: 'user', columns: [],
        where: { logic: 'AND', items: [{ column: 'age', op: 'BETWEEN', value: 10, value2: 30 }] },
        orderBy: [], groupBy: [], having: null, limit: null,
      };
      const { sql, params } = pgBuilder().build(node);
      expect(sql).toBe('SELECT * FROM "user" WHERE "age" BETWEEN $1 AND $2');
      expect(params).toEqual([10, 30]);
    });

    it('PG IN uses $N placeholders', () => {
      const node: SelectNode = {
        type: 'select', table: 'user', columns: [],
        where: { logic: 'AND', items: [{ column: 'id', op: 'IN', value: [1, 2] }] },
        orderBy: [], groupBy: [], having: null, limit: null,
      };
      const { sql, params } = pgBuilder().build(node);
      expect(sql).toBe('SELECT * FROM "user" WHERE "id" IN ($1, $2)');
      expect(params).toEqual([1, 2]);
    });
  });

  // ============ SQLite 方言差异 ============

  describe('SQLite dialect differences', () => {
    it('uses ? placeholders and double quotes', () => {
      const node: SelectNode = {
        type: 'select', table: 'user', columns: [],
        where: { logic: 'AND', items: [{ column: 'name', op: '=', value: 'x' }] },
        orderBy: [], groupBy: [], having: null, limit: null,
      };
      const { sql } = sqliteBuilder().build(node);
      expect(sql).toBe('SELECT * FROM "user" WHERE "name" = ?');
    });
  });
});
