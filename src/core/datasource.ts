import type { DataSource, DataSourceConfig, Connection, TransactionContext, Dialect, Plugin } from '../types';
import { createDialect } from '../dialect';
import { getCurrentTxConnection } from './transaction';

/** 如果当前在事务上下文中，优先使用事务连接执行 */
async function txAwareExecute(ds: DataSource, sql: string, params: any[]): Promise<any> {
  const txCtx = getCurrentTxConnection();
  if (txCtx && txCtx.datasource === ds) {
    return txCtx.connection.query(sql, params);
  }
  return null; // 返回 null 表示不在事务中，走正常逻辑
}

// ============ MySQL DataSource ============

class MysqlConnection implements Connection {
  constructor(private conn: any) {}
  async query(sql: string, params: any[]): Promise<any> {
    const cmd = sql.trimStart().toUpperCase();
    // BEGIN/COMMIT/ROLLBACK are not supported in prepared statement protocol
    if (cmd.startsWith('BEGIN') || cmd.startsWith('COMMIT') || cmd.startsWith('ROLLBACK') || cmd.startsWith('START')) {
      const [rows] = await this.conn.query(sql, params);
      return rows;
    }
    const [rows] = await this.conn.execute(sql, params);
    return rows;
  }
  release(): void {
    this.conn.release();
  }
}

class MysqlDataSource implements DataSource {
  dialect: Dialect;
  plugins: Plugin[];
  private pool: any;

  constructor(public config: DataSourceConfig) {
    this.dialect = createDialect('mysql');
    this.plugins = config.plugins ?? [];
  }

  private async getPool() {
    if (!this.pool) {
      const mysql2 = await import('mysql2/promise');
      this.pool = mysql2.createPool({
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 3306,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        waitForConnections: true,
        connectionLimit: this.config.pool?.max ?? 10,
      });
    }
    return this.pool;
  }

  async getConnection(): Promise<Connection> {
    const pool = await this.getPool();
    const conn = await pool.getConnection();
    return new MysqlConnection(conn);
  }

  async execute(sql: string, params: any[]): Promise<any> {
    const txResult = await txAwareExecute(this, sql, params);
    if (txResult !== null) return txResult;
    const pool = await this.getPool();
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    const tx: TransactionContext = {
      connection: new MysqlConnection(conn),
      async commit() { await conn.commit(); },
      async rollback() { await conn.rollback(); },
    };
    try {
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

// ============ PostgreSQL DataSource ============

class PgConnection implements Connection {
  constructor(private client: any) {}
  async query(sql: string, params: any[]): Promise<any> {
    const result = await this.client.query(sql, params);
    return result.rows;
  }
  release(): void {
    this.client.release();
  }
}

class PostgresDataSource implements DataSource {
  dialect: Dialect;
  plugins: Plugin[];
  private pool: any;

  constructor(public config: DataSourceConfig) {
    this.dialect = createDialect('postgres');
    this.plugins = config.plugins ?? [];
  }

  private async getPool() {
    if (!this.pool) {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 5432,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        min: this.config.pool?.min ?? 2,
        max: this.config.pool?.max ?? 10,
        idleTimeoutMillis: this.config.pool?.idleTimeout ?? 30000,
      });
    }
    return this.pool;
  }

  async getConnection(): Promise<Connection> {
    const pool = await this.getPool();
    const client = await pool.connect();
    return new PgConnection(client);
  }

  async execute(sql: string, params: any[]): Promise<any> {
    const txResult = await txAwareExecute(this, sql, params);
    if (txResult !== null) return txResult;
    const pool = await this.getPool();
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await pool.connect();
    await client.query('BEGIN');
    const tx: TransactionContext = {
      connection: new PgConnection(client),
      async commit() { await client.query('COMMIT'); },
      async rollback() { await client.query('ROLLBACK'); },
    };
    try {
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

// ============ SQLite DataSource ============

class SqliteConnection implements Connection {
  constructor(private db: any) {}
  async query(sql: string, params: any[]): Promise<any> {
    const trimmed = sql.trimStart().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      return this.db.prepare(sql).all(...params);
    }
    return this.db.prepare(sql).run(...params);
  }
  release(): void {
    // SQLite connections are not pooled
  }
}

class SqliteDataSource implements DataSource {
  dialect: Dialect;
  plugins: Plugin[];
  private db: any;

  constructor(public config: DataSourceConfig) {
    this.dialect = createDialect('sqlite');
    this.plugins = config.plugins ?? [];
  }

  private getDb() {
    if (!this.db) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3');
      this.db = new Database(this.config.database);
      this.db.pragma('journal_mode = WAL');
    }
    return this.db;
  }

  async getConnection(): Promise<Connection> {
    return new SqliteConnection(this.getDb());
  }

  async execute(sql: string, params: any[]): Promise<any> {
    const txResult = await txAwareExecute(this, sql, params);
    if (txResult !== null) return txResult;
    const conn = await this.getConnection();
    return conn.query(sql, params);
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const db = this.getDb();
    const conn = new SqliteConnection(db);
    db.prepare('BEGIN').run();
    const tx: TransactionContext = {
      connection: conn,
      async commit() { db.prepare('COMMIT').run(); },
      async rollback() { db.prepare('ROLLBACK').run(); },
    };
    try {
      const result = await fn(tx);
      db.prepare('COMMIT').run();
      return result;
    } catch (e) {
      db.prepare('ROLLBACK').run();
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this.db) this.db.close();
  }
}

// ============ Factory ============

export function createDataSource(config: DataSourceConfig): DataSource {
  switch (config.type) {
    case 'mysql': return new MysqlDataSource(config);
    case 'postgres': return new PostgresDataSource(config);
    case 'sqlite': return new SqliteDataSource(config);
    default: throw new Error(`Unsupported database type: ${config.type}`);
  }
}
