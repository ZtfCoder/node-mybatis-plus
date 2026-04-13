import 'reflect-metadata';

// Types
export type {
  EntityMeta, ColumnMeta, Condition, ConditionGroup, OrderByItem,
  SelectNode, InsertNode, UpdateNode, DeleteNode, SqlNode,
  Dialect, Plugin, PluginContext,
  DataSource, DataSourceConfig, Connection, TransactionContext, PoolConfig,
  Page,
} from './types';

// Decorators
export { Table, Column, Id } from './decorator';
export type { IdOptions, ColumnOptions } from './decorator';

// DataSource
export { createDataSource } from './core/datasource';

// Transaction
export { Transactional, withTransaction, setDefaultDataSource, getDefaultDataSource } from './core/transaction';
export type { TransactionalOptions } from './core/transaction';

// Dialect
export { MysqlDialect, PostgresDialect, SqliteDialect, createDialect } from './dialect';

// Wrapper
export { LambdaQueryWrapper } from './wrapper/query-wrapper';
export { LambdaUpdateWrapper } from './wrapper/update-wrapper';
export { AbstractWrapper } from './wrapper/abstract-wrapper';

// Mapper
export { BaseMapper } from './mapper/base-mapper';

// Builder
export { SqlBuilder } from './builder/sql-builder';
export type { CompiledSql } from './builder/sql-builder';

// Plugin
export { runPlugins } from './plugin/runner';
