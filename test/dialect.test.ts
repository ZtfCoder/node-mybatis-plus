import { describe, it, expect } from 'vitest';
import { MysqlDialect, PostgresDialect, SqliteDialect, createDialect } from '../src/dialect';

describe('Dialect', () => {
  describe('MysqlDialect', () => {
    const d = new MysqlDialect();
    it('placeholder always returns ?', () => {
      expect(d.placeholder(1)).toBe('?');
      expect(d.placeholder(5)).toBe('?');
    });
    it('quotes with backticks', () => {
      expect(d.quote('user_name')).toBe('`user_name`');
    });
    it('paginate', () => {
      expect(d.paginate('SELECT * FROM t', 10, 20)).toBe('SELECT * FROM t LIMIT 20 OFFSET 10');
    });
    it('insertReturningId returns null', () => {
      expect(d.insertReturningId('t', ['a'], 'id')).toBeNull();
    });
  });

  describe('PostgresDialect', () => {
    const d = new PostgresDialect();
    it('placeholder returns $N', () => {
      expect(d.placeholder(1)).toBe('$1');
      expect(d.placeholder(3)).toBe('$3');
    });
    it('quotes with double quotes', () => {
      expect(d.quote('user_name')).toBe('"user_name"');
    });
    it('paginate', () => {
      expect(d.paginate('SELECT * FROM t', 0, 10)).toBe('SELECT * FROM t LIMIT 10 OFFSET 0');
    });
    it('insertReturningId returns RETURNING clause', () => {
      expect(d.insertReturningId('t', ['a'], 'id')).toBe('RETURNING "id"');
    });
  });

  describe('SqliteDialect', () => {
    const d = new SqliteDialect();
    it('placeholder always returns ?', () => {
      expect(d.placeholder(1)).toBe('?');
    });
    it('quotes with double quotes', () => {
      expect(d.quote('age')).toBe('"age"');
    });
    it('insertReturningId returns null', () => {
      expect(d.insertReturningId('t', ['a'], 'id')).toBeNull();
    });
  });

  describe('createDialect', () => {
    it('creates correct dialect by type', () => {
      expect(createDialect('mysql')).toBeInstanceOf(MysqlDialect);
      expect(createDialect('postgres')).toBeInstanceOf(PostgresDialect);
      expect(createDialect('sqlite')).toBeInstanceOf(SqliteDialect);
    });
    it('throws on unknown type', () => {
      expect(() => createDialect('oracle')).toThrow('Unsupported dialect');
    });
  });
});
