import { describe, it, expect } from 'vitest';
import { createDataSource } from '../src/core/datasource';
import { MysqlDialect, PostgresDialect, SqliteDialect } from '../src/dialect';

describe('createDataSource', () => {
  it('creates mysql datasource with correct dialect', () => {
    const ds = createDataSource({ type: 'mysql', database: 'test' });
    expect(ds.dialect).toBeInstanceOf(MysqlDialect);
    expect(ds.config.type).toBe('mysql');
  });

  it('creates postgres datasource with correct dialect', () => {
    const ds = createDataSource({ type: 'postgres', database: 'test' });
    expect(ds.dialect).toBeInstanceOf(PostgresDialect);
  });

  it('creates sqlite datasource with correct dialect', () => {
    const ds = createDataSource({ type: 'sqlite', database: ':memory:' });
    expect(ds.dialect).toBeInstanceOf(SqliteDialect);
  });

  it('throws on unsupported type', () => {
    expect(() => createDataSource({ type: 'oracle' as any, database: 'test' })).toThrow('Unsupported database type');
  });

  it('stores plugins from config', () => {
    const plugin = { name: 'test', order: 1 };
    const ds = createDataSource({ type: 'sqlite', database: ':memory:', plugins: [plugin] });
    expect(ds.plugins).toHaveLength(1);
    expect(ds.plugins[0].name).toBe('test');
  });

  it('defaults to empty plugins', () => {
    const ds = createDataSource({ type: 'sqlite', database: ':memory:' });
    expect(ds.plugins).toEqual([]);
  });
});

describe('SQLite DataSource connection', () => {
  it('executes queries on in-memory database', async () => {
    const ds = createDataSource({ type: 'sqlite', database: ':memory:' });
    await ds.execute('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)', []);
    await ds.execute('INSERT INTO test (val) VALUES (?)', ['hello']);
    const rows = await ds.execute('SELECT * FROM test', []);
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe('hello');
    await ds.close();
  });

  it('getConnection returns working connection', async () => {
    const ds = createDataSource({ type: 'sqlite', database: ':memory:' });
    await ds.execute('CREATE TABLE t2 (id INTEGER PRIMARY KEY)', []);
    const conn = await ds.getConnection();
    const result = await conn.query('SELECT COUNT(*) AS cnt FROM t2', []);
    expect(result).toHaveLength(1);
    conn.release(); // no-op for sqlite
    await ds.close();
  });
});
