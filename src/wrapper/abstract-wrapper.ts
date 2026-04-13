import type { Condition, ConditionGroup, OrderByItem, EntityMeta } from '../types';

export class AbstractWrapper<T, Self extends AbstractWrapper<T, Self>> {
  protected conditionGroup: ConditionGroup = { logic: 'AND', items: [] };
  protected _orderBy: OrderByItem[] = [];
  protected _groupBy: string[] = [];
  protected _having: ConditionGroup | null = null;

  constructor(protected entityMeta: EntityMeta) {}

  // ---- 条件方法 ----

  eq(column: keyof T & string, value: any): Self;
  eq(condition: boolean, column: keyof T & string, value: any): Self;
  eq(...args: any[]): Self {
    return this.addCondition('=', args);
  }

  ne(column: keyof T & string, value: any): Self;
  ne(condition: boolean, column: keyof T & string, value: any): Self;
  ne(...args: any[]): Self {
    return this.addCondition('!=', args);
  }

  gt(column: keyof T & string, value: any): Self;
  gt(condition: boolean, column: keyof T & string, value: any): Self;
  gt(...args: any[]): Self {
    return this.addCondition('>', args);
  }

  ge(column: keyof T & string, value: any): Self;
  ge(condition: boolean, column: keyof T & string, value: any): Self;
  ge(...args: any[]): Self {
    return this.addCondition('>=', args);
  }

  lt(column: keyof T & string, value: any): Self;
  lt(condition: boolean, column: keyof T & string, value: any): Self;
  lt(...args: any[]): Self {
    return this.addCondition('<', args);
  }

  le(column: keyof T & string, value: any): Self;
  le(condition: boolean, column: keyof T & string, value: any): Self;
  le(...args: any[]): Self {
    return this.addCondition('<=', args);
  }

  like(column: keyof T & string, value: string): Self;
  like(condition: boolean, column: keyof T & string, value: string): Self;
  like(...args: any[]): Self {
    return this.addCondition('LIKE', args, v => `%${v}%`);
  }

  likeLeft(column: keyof T & string, value: string): Self;
  likeLeft(condition: boolean, column: keyof T & string, value: string): Self;
  likeLeft(...args: any[]): Self {
    return this.addCondition('LIKE', args, v => `%${v}`);
  }

  likeRight(column: keyof T & string, value: string): Self;
  likeRight(condition: boolean, column: keyof T & string, value: string): Self;
  likeRight(...args: any[]): Self {
    return this.addCondition('LIKE', args, v => `${v}%`);
  }

  between(column: keyof T & string, val1: any, val2: any): Self;
  between(condition: boolean, column: keyof T & string, val1: any, val2: any): Self;
  between(...args: any[]): Self {
    const { active, column, values } = this.parseArgs(args, 2);
    if (active) {
      this.conditionGroup.items.push({
        column: this.resolveColumn(column),
        op: 'BETWEEN',
        value: values[0],
        value2: values[1],
      });
    }
    return this as unknown as Self;
  }

  in(column: keyof T & string, values: any[]): Self;
  in(condition: boolean, column: keyof T & string, values: any[]): Self;
  in(...args: any[]): Self {
    return this.addCondition('IN', args);
  }

  notIn(column: keyof T & string, values: any[]): Self;
  notIn(condition: boolean, column: keyof T & string, values: any[]): Self;
  notIn(...args: any[]): Self {
    return this.addCondition('NOT IN', args);
  }

  isNull(column: keyof T & string): Self;
  isNull(condition: boolean, column: keyof T & string): Self;
  isNull(...args: any[]): Self {
    const hasCondition = typeof args[0] === 'boolean';
    const active = hasCondition ? args[0] : true;
    const column = hasCondition ? args[1] : args[0];
    if (active) {
      this.conditionGroup.items.push({ column: this.resolveColumn(column), op: 'IS NULL' });
    }
    return this as unknown as Self;
  }

  isNotNull(column: keyof T & string): Self;
  isNotNull(condition: boolean, column: keyof T & string): Self;
  isNotNull(...args: any[]): Self {
    const hasCondition = typeof args[0] === 'boolean';
    const active = hasCondition ? args[0] : true;
    const column = hasCondition ? args[1] : args[0];
    if (active) {
      this.conditionGroup.items.push({ column: this.resolveColumn(column), op: 'IS NOT NULL' });
    }
    return this as unknown as Self;
  }

  or(fn: (w: Self) => void): Self {
    const sub = this.createNested('OR');
    fn(sub);
    const nested = (sub as unknown as AbstractWrapper<T, Self>).conditionGroup;
    if (nested.items.length) this.conditionGroup.items.push(nested);
    return this as unknown as Self;
  }

  and(fn: (w: Self) => void): Self {
    const sub = this.createNested('AND');
    fn(sub);
    const nested = (sub as unknown as AbstractWrapper<T, Self>).conditionGroup;
    if (nested.items.length) this.conditionGroup.items.push(nested);
    return this as unknown as Self;
  }

  // ---- 排序 & 分组 ----

  orderByAsc(...columns: (keyof T & string)[]): Self {
    for (const c of columns) this._orderBy.push({ column: this.resolveColumn(c), direction: 'ASC' });
    return this as unknown as Self;
  }

  orderByDesc(...columns: (keyof T & string)[]): Self {
    for (const c of columns) this._orderBy.push({ column: this.resolveColumn(c), direction: 'DESC' });
    return this as unknown as Self;
  }

  groupBy(...columns: (keyof T & string)[]): Self {
    this._groupBy.push(...columns.map(c => this.resolveColumn(c)));
    return this as unknown as Self;
  }

  // ---- 内部方法 ----

  protected resolveColumn(propertyName: string): string {
    const col = this.entityMeta.columns.find(c => c.propertyName === propertyName);
    return col ? col.columnName : propertyName;
  }

  getConditionGroup(): ConditionGroup { return this.conditionGroup; }
  getOrderBy(): OrderByItem[] { return this._orderBy; }
  getGroupBy(): string[] { return this._groupBy; }
  getHaving(): ConditionGroup | null { return this._having; }

  private addCondition(op: Condition['op'], args: any[], transform?: (v: any) => any): Self {
    const { active, column, values } = this.parseArgs(args, 1);
    if (active) {
      const value = transform ? transform(values[0]) : values[0];
      this.conditionGroup.items.push({ column: this.resolveColumn(column), op, value });
    }
    return this as unknown as Self;
  }

  private parseArgs(args: any[], valueCount: number): { active: boolean; column: string; values: any[] } {
    const hasCondition = typeof args[0] === 'boolean';
    const offset = hasCondition ? 1 : 0;
    return {
      active: hasCondition ? args[0] : true,
      column: args[offset],
      values: args.slice(offset + 1, offset + 1 + valueCount),
    };
  }

  private createNested(logic: 'AND' | 'OR'): Self {
    const Ctor = this.constructor as new (meta: EntityMeta) => Self;
    const nested = new Ctor(this.entityMeta);
    (nested as unknown as AbstractWrapper<T, Self>).conditionGroup = { logic, items: [] };
    return nested;
  }
}
