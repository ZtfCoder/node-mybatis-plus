import type { DataSource, EntityMeta, InsertNode, DeleteNode, Page, SqlNode } from '../types';
import { getEntityMeta } from '../decorator';
import { SqlBuilder } from '../builder/sql-builder';
import { LambdaQueryWrapper } from '../wrapper/query-wrapper';
import { LambdaUpdateWrapper } from '../wrapper/update-wrapper';
import { runPlugins } from '../plugin/runner';

export class BaseMapper<T extends object> {
  protected entityMeta: EntityMeta;
  protected ds: DataSource;

  constructor(entityClass: Function, datasource: DataSource) {
    this.entityMeta = getEntityMeta(entityClass);
    this.ds = datasource;
  }

  // ---- 链式入口 ----

  lambdaQuery(): LambdaQueryWrapper<T> {
    return new LambdaQueryWrapper<T>(this.entityMeta).bindDataSource(this.ds);
  }

  lambdaUpdate(): LambdaUpdateWrapper<T> {
    return new LambdaUpdateWrapper<T>(this.entityMeta).bindDataSource(this.ds);
  }

  // ---- 新增 ----

  async insert(entity: Partial<T>): Promise<number> {
    const { columns, values } = this.extractColumns(entity);
    const node: InsertNode = { type: 'insert', table: this.entityMeta.tableName, columns, values: [values] };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.insertId ?? result?.[0]?.id ?? result?.lastInsertRowid ?? 0;
  }

  async insertBatch(entities: Partial<T>[]): Promise<number> {
    if (!entities.length) return 0;
    const cols = this.getInsertableColumns();
    const columns = cols.map(c => c.columnName);
    const values = entities.map(e => cols.map(c => (e as any)[c.propertyName]));
    const node: InsertNode = { type: 'insert', table: this.entityMeta.tableName, columns, values };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? entities.length;
  }

  // ---- 删除 ----

  async deleteById(id: any): Promise<number> {
    const idCol = this.requireIdColumn();
    const node: DeleteNode = {
      type: 'delete',
      table: this.entityMeta.tableName,
      where: { logic: 'AND', items: [{ column: idCol.columnName, op: '=', value: id }] },
    };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }

  async deleteBatchIds(ids: any[]): Promise<number> {
    if (!ids.length) return 0;
    const idCol = this.requireIdColumn();
    const node: DeleteNode = {
      type: 'delete',
      table: this.entityMeta.tableName,
      where: { logic: 'AND', items: [{ column: idCol.columnName, op: 'IN', value: ids }] },
    };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }

  async delete(wrapper: LambdaQueryWrapper<T>): Promise<number> {
    const group = wrapper.getConditionGroup();
    const node: DeleteNode = {
      type: 'delete',
      table: this.entityMeta.tableName,
      where: group.items.length ? group : null,
    };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }

  // ---- 修改 ----

  async updateById(entity: Partial<T>): Promise<number> {
    const idCol = this.requireIdColumn();
    const idValue = (entity as any)[idCol.propertyName];
    if (idValue == null) throw new Error('Entity must have id value for updateById');
    const sets = this.entityMeta.columns
      .filter(c => c.exist && !c.isPrimary && (entity as any)[c.propertyName] !== undefined)
      .map(c => ({ column: c.columnName, value: (entity as any)[c.propertyName] }));
    if (!sets.length) throw new Error('No fields to update');
    const node = {
      type: 'update' as const,
      table: this.entityMeta.tableName,
      sets,
      where: { logic: 'AND' as const, items: [{ column: idCol.columnName, op: '=' as const, value: idValue }] },
    };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }

  async update(entity: Partial<T>, wrapper: LambdaQueryWrapper<T>): Promise<number> {
    const sets = this.entityMeta.columns
      .filter(c => c.exist && !c.isPrimary && (entity as any)[c.propertyName] !== undefined)
      .map(c => ({ column: c.columnName, value: (entity as any)[c.propertyName] }));
    if (!sets.length) throw new Error('No fields to update');
    const group = wrapper.getConditionGroup();
    const node = {
      type: 'update' as const,
      table: this.entityMeta.tableName,
      sets,
      where: group.items.length ? group : null,
    };
    const { sql, params } = new SqlBuilder(this.ds.dialect).build(node);
    const result = await this.executeWithPlugins(node, sql, params);
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }

  // ---- 查询 ----

  async selectById(id: any): Promise<T | null> {
    const idCol = this.requireIdColumn();
    return this.lambdaQuery().eq(idCol.propertyName as keyof T & string, id).one();
  }

  async selectBatchIds(ids: any[]): Promise<T[]> {
    if (!ids.length) return [];
    const idCol = this.requireIdColumn();
    return this.lambdaQuery().in(idCol.propertyName as keyof T & string, ids).list();
  }

  async selectOne(wrapper: LambdaQueryWrapper<T>): Promise<T | null> {
    return wrapper.one();
  }

  async selectList(wrapper?: LambdaQueryWrapper<T>): Promise<T[]> {
    return (wrapper ?? this.lambdaQuery()).list();
  }

  async selectCount(wrapper?: LambdaQueryWrapper<T>): Promise<number> {
    return (wrapper ?? this.lambdaQuery()).count();
  }

  async selectPage(page: number, size: number, wrapper?: LambdaQueryWrapper<T>): Promise<Page<T>> {
    return (wrapper ?? this.lambdaQuery()).pageResult(page, size);
  }

  // ---- 自定义 SQL ----

  async rawQuery(sql: string, params: Record<string, any> = {}): Promise<any> {
    const { parsedSql, parsedParams } = this.parseNamedParams(sql, params);
    return this.ds.execute(parsedSql, parsedParams);
  }

  // ---- 内部方法 ----

  private extractColumns(entity: Partial<T>): { columns: string[]; values: any[] } {
    const cols = this.getInsertableColumns().filter(c => (entity as any)[c.propertyName] !== undefined);
    return {
      columns: cols.map(c => c.columnName),
      values: cols.map(c => (entity as any)[c.propertyName]),
    };
  }

  private getInsertableColumns() {
    return this.entityMeta.columns.filter(c => c.exist && !(c.isPrimary && c.idType === 'auto'));
  }

  private requireIdColumn() {
    if (!this.entityMeta.idColumn) throw new Error(`No @Id defined on ${this.entityMeta.target.name}`);
    return this.entityMeta.idColumn;
  }

  private parseNamedParams(sql: string, params: Record<string, any>): { parsedSql: string; parsedParams: any[] } {
    const parsedParams: any[] = [];
    let index = 0;
    const parsedSql = sql.replace(/#\{(\w+)\}/g, (_, key) => {
      parsedParams.push(params[key]);
      return this.ds.dialect.placeholder(++index);
    });
    return { parsedSql, parsedParams };
  }

  /** 通过插件链路执行 SQL */
  private executeWithPlugins(node: SqlNode, sql: string, params: any[]): Promise<any> {
    if (this.ds.plugins.length) {
      return runPlugins(this.ds, node, sql, params, this.entityMeta);
    }
    return this.ds.execute(sql, params);
  }
}
