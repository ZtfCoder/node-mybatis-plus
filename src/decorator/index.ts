import 'reflect-metadata';
import type { EntityMeta, ColumnMeta, FillStrategy } from '../types';

const ENTITY_META_KEY = Symbol('entity:meta');

// 全局元数据缓存
const metadataCache = new Map<Function, EntityMeta>();

export function Table(tableName: string): ClassDecorator {
  return (target) => {
    const existing = getOrCreateMeta(target);
    existing.tableName = tableName;
    metadataCache.set(target, existing);
  };
}

export interface IdOptions {
  type?: 'auto' | 'uuid' | 'snowflake' | 'input';
}

export function Id(options?: IdOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const meta = getOrCreateMeta(target.constructor);
    const col = ensureColumn(meta, propertyKey as string);
    col.isPrimary = true;
    col.idType = options?.type ?? 'auto';
    meta.idColumn = col;
  };
}

export interface ColumnOptions {
  name?: string;
  exist?: boolean;
}

export function Column(nameOrOptions?: string | ColumnOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const meta = getOrCreateMeta(target.constructor);
    const col = ensureColumn(meta, propertyKey as string);
    if (typeof nameOrOptions === 'string') {
      col.columnName = nameOrOptions;
    } else if (nameOrOptions) {
      if (nameOrOptions.name) col.columnName = nameOrOptions.name;
      if (nameOrOptions.exist === false) col.exist = false;
    }
  };
}

function getOrCreateMeta(target: Function): EntityMeta {
  let meta = metadataCache.get(target);
  if (!meta) {
    meta = { tableName: '', columns: [], idColumn: null, target };
    metadataCache.set(target, meta);
  }
  return meta;
}

function ensureColumn(meta: EntityMeta, propertyName: string): ColumnMeta {
  let col = meta.columns.find(c => c.propertyName === propertyName);
  if (!col) {
    col = {
      propertyName,
      columnName: camelToSnake(propertyName),
      isPrimary: false,
      exist: true,
    };
    meta.columns.push(col);
  }
  return col;
}

export function getEntityMeta(target: Function): EntityMeta {
  const meta = metadataCache.get(target);
  if (!meta) throw new Error(`No entity metadata found for ${target.name}. Did you forget @Table?`);
  return meta;
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// ============ @LogicDelete ============

export interface LogicDeleteOptions {
  /** 已删除的值，默认 1 */
  deleteValue?: any;
  /** 未删除的值，默认 0 */
  notDeleteValue?: any;
  /** 数据库列名，不传则自动 camelCase → snake_case */
  name?: string;
}

export function LogicDelete(options?: LogicDeleteOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const meta = getOrCreateMeta(target.constructor);
    const col = ensureColumn(meta, propertyKey as string);
    if (options?.name) col.columnName = options.name;
    col.isLogicDelete = true;
    col.logicDeleteValue = options?.deleteValue ?? 1;
    col.logicNotDeleteValue = options?.notDeleteValue ?? 0;
    meta.logicDeleteColumn = col;
  };
}

// ============ @TableField ============

export interface TableFieldOptions {
  /** 自动填充策略 */
  fill?: FillStrategy;
  /** 数据库列名，不传则自动 camelCase → snake_case */
  name?: string;
  /** 是否为数据库字段，默认 true */
  exist?: boolean;
}

export function TableField(options: TableFieldOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const meta = getOrCreateMeta(target.constructor);
    const col = ensureColumn(meta, propertyKey as string);
    if (options.name) col.columnName = options.name;
    if (options.exist === false) col.exist = false;
    if (options.fill) col.fill = options.fill;
  };
}
