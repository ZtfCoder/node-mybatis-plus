import type { Dialect } from '../types';

export class MysqlDialect implements Dialect {
  placeholder(_index: number): string {
    return '?';
  }
  quote(identifier: string): string {
    return `\`${identifier}\``;
  }
  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }
  insertReturningId(): null {
    return null; // MySQL uses insertId from result
  }
}

export class PostgresDialect implements Dialect {
  placeholder(index: number): string {
    return `$${index}`;
  }
  quote(identifier: string): string {
    return `"${identifier}"`;
  }
  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }
  insertReturningId(_table: string, _columns: string[], idColumn: string): string {
    return `RETURNING "${idColumn}"`;
  }
}

export class SqliteDialect implements Dialect {
  placeholder(_index: number): string {
    return '?';
  }
  quote(identifier: string): string {
    return `"${identifier}"`;
  }
  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }
  insertReturningId(): null {
    return null; // SQLite uses lastInsertRowid
  }
}

export function createDialect(type: string): Dialect {
  switch (type) {
    case 'mysql': return new MysqlDialect();
    case 'postgres': return new PostgresDialect();
    case 'sqlite': return new SqliteDialect();
    default: throw new Error(`Unsupported dialect: ${type}`);
  }
}
