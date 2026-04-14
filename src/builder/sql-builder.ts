import type { Dialect, SqlNode, SelectNode, InsertNode, UpdateNode, DeleteNode, ConditionGroup, Condition } from '../types';

export interface CompiledSql {
  sql: string;
  params: any[];
}

export class SqlBuilder {
  private params: any[] = [];
  private paramIndex = 0;

  constructor(private dialect: Dialect) {}

  build(node: SqlNode): CompiledSql {
    this.params = [];
    this.paramIndex = 0;
    let sql: string;
    switch (node.type) {
      case 'select': sql = this.buildSelect(node); break;
      case 'insert': sql = this.buildInsert(node); break;
      case 'update': sql = this.buildUpdate(node); break;
      case 'delete': sql = this.buildDelete(node); break;
    }
    return { sql, params: this.params };
  }

  private buildSelect(node: SelectNode): string {
    const cols = node.columns.length ? node.columns.map(c => this.q(c)).join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${this.q(node.table)}`;
    if (node.where) {
      const w = this.buildConditionGroup(node.where);
      if (w) sql += ` WHERE ${w}`;
    }
    if (node.groupBy.length) {
      sql += ` GROUP BY ${node.groupBy.map(c => this.q(c)).join(', ')}`;
    }
    if (node.having) {
      const h = this.buildConditionGroup(node.having);
      if (h) sql += ` HAVING ${h}`;
    }
    if (node.orderBy.length) {
      sql += ` ORDER BY ${node.orderBy.map(o => `${this.q(o.column)} ${o.direction}`).join(', ')}`;
    }
    if (node.limit) {
      sql = this.dialect.paginate(sql, node.limit.offset, node.limit.count);
    }
    return sql;
  }

  private buildInsert(node: InsertNode): string {
    const cols = node.columns.map(c => this.q(c)).join(', ');
    const rows = node.values.map(row => {
      const placeholders = row.map(v => this.addParam(v));
      return `(${placeholders.join(', ')})`;
    }).join(', ');
    let sql = `INSERT INTO ${this.q(node.table)} (${cols}) VALUES ${rows}`;
    if (node.returningId) {
      const ret = this.dialect.insertReturningId(node.table, node.columns, node.returningId);
      if (ret) sql += ` ${ret}`;
    }
    return sql;
  }

  private buildUpdate(node: UpdateNode): string {
    const sets = node.sets.map(s => `${this.q(s.column)} = ${this.addParam(s.value)}`).join(', ');
    let sql = `UPDATE ${this.q(node.table)} SET ${sets}`;
    if (node.where) {
      const w = this.buildConditionGroup(node.where);
      if (w) sql += ` WHERE ${w}`;
    }
    return sql;
  }

  private buildDelete(node: DeleteNode): string {
    let sql = `DELETE FROM ${this.q(node.table)}`;
    if (node.where) {
      const w = this.buildConditionGroup(node.where);
      if (w) sql += ` WHERE ${w}`;
    }
    return sql;
  }

  private buildConditionGroup(group: ConditionGroup): string {
    const parts: string[] = [];
    for (const item of group.items) {
      if ('logic' in item) {
        const sub = this.buildConditionGroup(item);
        if (sub) parts.push(`(${sub})`);
      } else {
        parts.push(this.buildCondition(item));
      }
    }
    return parts.join(` ${group.logic} `);
  }

  private buildCondition(cond: Condition): string {
    const col = this.q(cond.column);
    switch (cond.op) {
      case 'IS NULL': return `${col} IS NULL`;
      case 'IS NOT NULL': return `${col} IS NOT NULL`;
      case 'BETWEEN': return `${col} BETWEEN ${this.addParam(cond.value)} AND ${this.addParam(cond.value2)}`;
      case 'IN':
      case 'NOT IN': {
        const list = (cond.value as any[]).map(v => this.addParam(v)).join(', ');
        return `${col} ${cond.op} (${list})`;
      }
      default:
        return `${col} ${cond.op} ${this.addParam(cond.value)}`;
    }
  }

  private addParam(value: any): string {
    this.params.push(value);
    return this.dialect.placeholder(++this.paramIndex);
  }

  private q(identifier: string): string {
    return this.dialect.quote(identifier);
  }
}
