import type { EntityMeta, UpdateNode, DataSource } from '../types';
import { AbstractWrapper } from './abstract-wrapper';
import { SqlBuilder } from '../builder/sql-builder';
import { runPlugins } from '../plugin/runner';

export class LambdaUpdateWrapper<T> extends AbstractWrapper<T, LambdaUpdateWrapper<T>> {
  private _sets: { column: string; value: any }[] = [];
  private _datasource: DataSource | null = null;

  constructor(entityMeta: EntityMeta) {
    super(entityMeta);
  }

  bindDataSource(ds: DataSource): this {
    this._datasource = ds;
    return this;
  }

  set(column: keyof T & string, value: any): this;
  set(condition: boolean, column: keyof T & string, value: any): this;
  set(...args: any[]): this {
    const hasCondition = typeof args[0] === 'boolean';
    const active = hasCondition ? args[0] : true;
    const column = hasCondition ? args[1] : args[0];
    const value = hasCondition ? args[2] : args[1];
    if (active) {
      this._sets.push({ column: this.resolveColumn(column), value });
    }
    return this;
  }

  buildUpdateNode(): UpdateNode {
    return {
      type: 'update',
      table: this.entityMeta.tableName,
      sets: this._sets,
      where: this.conditionGroup.items.length ? this.conditionGroup : null,
    };
  }

  async execute(): Promise<number> {
    if (!this._datasource) throw new Error('DataSource not bound.');
    if (!this._sets.length) throw new Error('No SET clause specified.');
    const node = this.buildUpdateNode();
    const builder = new SqlBuilder(this._datasource.dialect);
    const { sql, params } = builder.build(node);
    let result: any;
    if (this._datasource.plugins.length) {
      result = await runPlugins(this._datasource, node, sql, params, this.entityMeta);
    } else {
      result = await this._datasource.execute(sql, params);
    }
    return result?.affectedRows ?? result?.rowCount ?? result?.changes ?? 0;
  }
}
