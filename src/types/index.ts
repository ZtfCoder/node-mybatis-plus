// ============ Entity Metadata ============

export type FillStrategy = 'insert' | 'update' | 'insertAndUpdate';

export interface ColumnMeta {
  propertyName: string;
  columnName: string;
  isPrimary: boolean;
  idType?: 'auto' | 'uuid' | 'snowflake' | 'input';
  exist: boolean;
  // 逻辑删除
  isLogicDelete?: boolean;
  logicDeleteValue?: any;    // 已删除的值，默认 1
  logicNotDeleteValue?: any; // 未删除的值，默认 0
  // 自动填充
  fill?: FillStrategy;
}

export interface EntityMeta {
  tableName: string;
  columns: ColumnMeta[];
  idColumn: ColumnMeta | null;
  target: Function;
  logicDeleteColumn?: ColumnMeta; // 逻辑删除列（如果有）
}

// ============ SQL AST ============

export type SqlNodeType = 'select' | 'insert' | 'update' | 'delete';

export interface Condition {
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'BETWEEN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
  value2?: any;
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  items: (Condition | ConditionGroup)[];
}

export interface OrderByItem {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface SelectNode {
  type: 'select';
  table: string;
  columns: string[];
  where: ConditionGroup | null;
  orderBy: OrderByItem[];
  groupBy: string[];
  having: ConditionGroup | null;
  limit: { offset: number; count: number } | null;
}

export interface InsertNode {
  type: 'insert';
  table: string;
  columns: string[];
  values: any[][];
}

export interface UpdateNode {
  type: 'update';
  table: string;
  sets: { column: string; value: any }[];
  where: ConditionGroup | null;
}

export interface DeleteNode {
  type: 'delete';
  table: string;
  where: ConditionGroup | null;
}

export type SqlNode = SelectNode | InsertNode | UpdateNode | DeleteNode;

// ============ Dialect ============

export interface Dialect {
  placeholder(index: number): string;
  quote(identifier: string): string;
  paginate(sql: string, offset: number, limit: number): string;
  insertReturningId(table: string, columns: string[], idColumn: string): string | null;
}

// ============ Plugin ============

export interface PluginContext {
  node: SqlNode;
  sql: string;
  params: any[];
  entityMeta: EntityMeta;
}

export interface Plugin {
  name: string;
  order: number;
  beforeExecute?(ctx: PluginContext): Promise<void> | void;
  afterExecute?(ctx: PluginContext, result: any): Promise<any> | any;
}

// ============ DataSource ============

export interface PoolConfig {
  min?: number;
  max?: number;
  idleTimeout?: number;
  acquireTimeout?: number;
}

export interface DataSourceConfig {
  type: 'mysql' | 'postgres' | 'sqlite';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  pool?: PoolConfig;
  plugins?: Plugin[];
  namingStrategy?: 'camelToSnake' | ((name: string) => string);
}

export interface Connection {
  query(sql: string, params: any[]): Promise<any>;
  release(): void;
}

export interface DataSource {
  config: DataSourceConfig;
  dialect: Dialect;
  plugins: Plugin[];
  getConnection(): Promise<Connection>;
  execute(sql: string, params: any[]): Promise<any>;
  close(): Promise<void>;
  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface TransactionContext {
  connection: Connection;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ============ Page ============

export interface Page<T> {
  records: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
