import type { EntityMeta, SelectNode, DataSource, Page } from '../types';
import { AbstractWrapper } from './abstract-wrapper';
import { SqlBuilder } from '../builder/sql-builder';
import { runPlugins } from '../plugin/runner';

export class LambdaQueryWrapper<T> extends AbstractWrapper<T, LambdaQueryWrapper<T>> {
  private _columns: string[] = [];
  private _limit: { offset: number; count: number } | null = null;
  private _datasource: DataSource | null = null;

  constructor(entityMeta: EntityMeta) {
    super(entityMeta);
  }

  /** 绑定数据源（由 BaseMapper 调用） */
  bindDataSource(ds: DataSource): this {
    this._datasource = ds;
    return this;
  }

  select(...columns: (keyof T & string)[]): this {
    this._columns = columns.map(c => this.resolveColumn(c));
    return this;
  }

  page(page: number, size: number): this {
    this._limit = { offset: (page - 1) * size, count: size };
    return this;
  }

  /** 构建 SelectNode AST */
  buildSelectNode(): SelectNode {
    return {
      type: 'select',
      table: this.entityMeta.tableName,
      columns: this._columns,
      where: this.conditionGroup.items.length ? this.conditionGroup : null,
      orderBy: this._orderBy,
      groupBy: this._groupBy,
      having: this._having,
      limit: this._limit,
    };
  }

  /** 终结操作：执行查询返回列表 */
  async list(): Promise<T[]> {
    const ds = this.requireDs();
    const node = this.buildSelectNode();
    const builder = new SqlBuilder(ds.dialect);
    const { sql, params } = builder.build(node);
    if (ds.plugins.length) {
      return runPlugins(ds, node, sql, params, this.entityMeta) as Promise<T[]>;
    }
    return ds.execute(sql, params) as Promise<T[]>;
  }

  /** 终结操作：查询单条 */
  async one(): Promise<T | null> {
    this._limit = { offset: 0, count: 1 };
    const list = await this.list();
    return list[0] ?? null;
  }

  /** 终结操作：查询数量 */
  async count(): Promise<number> {
    const ds = this.requireDs();
    const node: SelectNode = {
      ...this.buildSelectNode(),
      columns: [],
      orderBy: [],
      limit: null,
    };
    // 手动构建 COUNT SQL
    const builder = new SqlBuilder(ds.dialect);
    const { sql, params } = builder.build(node);
    const countSql = sql.replace(/^SELECT \* FROM/, 'SELECT COUNT(*) AS total FROM');
    let rows: any;
    if (ds.plugins.length) {
      rows = await runPlugins(ds, node, countSql, params, this.entityMeta);
    } else {
      rows = await ds.execute(countSql, params);
    }
    return Number(rows[0]?.total ?? rows[0]?.count ?? 0);
  }

  /** 终结操作：分页查询 */
  async pageResult(page: number, size: number): Promise<Page<T>> {
    this._limit = { offset: (page - 1) * size, count: size };
    const [records, total] = await Promise.all([
      this.list(),
      this.count(),
    ]);
    return {
      records,
      total,
      page,
      size,
      pages: Math.ceil(total / size),
    };
  }

  private requireDs(): DataSource {
    if (!this._datasource) throw new Error('DataSource not bound. Use BaseMapper to create wrapper.');
    return this._datasource;
  }
}
