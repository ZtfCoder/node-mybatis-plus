# 类型定义

node-mybatis-plus 导出的核心 TypeScript 类型定义。

## Page\<T\>

分页查询结果对象。

```ts
interface Page<T> {
  records: T[]
  total: number
  page: number
  size: number
  pages: number
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `records` | `T[]` | 当前页数据列表 |
| `total` | `number` | 总记录数 |
| `page` | `number` | 当前页码 |
| `size` | `number` | 每页条数 |
| `pages` | `number` | 总页数，计算方式：`Math.ceil(total / size)` |

## EntityMeta

实体元数据，由 `@Table` 装饰器生成，描述实体类与数据库表的映射关系。

```ts
interface EntityMeta {
  tableName: string
  columns: ColumnMeta[]
  idColumn: ColumnMeta | null
  target: Function
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `tableName` | `string` | 数据库表名 |
| `columns` | `ColumnMeta[]` | 所有列的元数据列表 |
| `idColumn` | `ColumnMeta \| null` | 主键列元数据，未定义 `@Id` 时为 `null` |
| `target` | `Function` | 实体类的构造函数引用 |

## ColumnMeta

列元数据，描述实体属性与数据库列的映射关系。

```ts
interface ColumnMeta {
  propertyName: string
  columnName: string
  isPrimary: boolean
  idType?: 'auto' | 'uuid' | 'snowflake' | 'input'
  exist: boolean
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `propertyName` | `string` | 实体类中的属性名 |
| `columnName` | `string` | 数据库列名 |
| `isPrimary` | `boolean` | 是否为主键 |
| `idType` | `'auto' \| 'uuid' \| 'snowflake' \| 'input'` | 主键生成策略，仅主键列有效 |
| `exist` | `boolean` | 是否映射到数据库列，`false` 表示虚拟字段 |

## SqlNode

SQL AST 节点联合类型，表示四种 SQL 操作的结构化描述。

```ts
type SqlNode = SelectNode | InsertNode | UpdateNode | DeleteNode
```

### SelectNode

```ts
interface SelectNode {
  type: 'select'
  table: string
  columns: string[]
  where: ConditionGroup | null
  orderBy: OrderByItem[]
  groupBy: string[]
  having: ConditionGroup | null
  limit: { offset: number; count: number } | null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'select'` | 节点类型标识 |
| `table` | `string` | 表名 |
| `columns` | `string[]` | 查询列，空数组表示 `SELECT *` |
| `where` | `ConditionGroup \| null` | WHERE 条件组 |
| `orderBy` | `OrderByItem[]` | 排序项列表 |
| `groupBy` | `string[]` | 分组列列表 |
| `having` | `ConditionGroup \| null` | HAVING 条件组 |
| `limit` | `{ offset: number; count: number } \| null` | 分页参数 |

### InsertNode

```ts
interface InsertNode {
  type: 'insert'
  table: string
  columns: string[]
  values: any[][]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'insert'` | 节点类型标识 |
| `table` | `string` | 表名 |
| `columns` | `string[]` | 插入列名列表 |
| `values` | `any[][]` | 值列表，支持批量插入（多行） |

### UpdateNode

```ts
interface UpdateNode {
  type: 'update'
  table: string
  sets: { column: string; value: any }[]
  where: ConditionGroup | null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'update'` | 节点类型标识 |
| `table` | `string` | 表名 |
| `sets` | `{ column: string; value: any }[]` | SET 子句列表 |
| `where` | `ConditionGroup \| null` | WHERE 条件组 |

### DeleteNode

```ts
interface DeleteNode {
  type: 'delete'
  table: string
  where: ConditionGroup | null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'delete'` | 节点类型标识 |
| `table` | `string` | 表名 |
| `where` | `ConditionGroup \| null` | WHERE 条件组 |

## Condition

单个条件表达式。

```ts
interface Condition {
  column: string
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'BETWEEN' | 'IS NULL' | 'IS NOT NULL'
  value?: any
  value2?: any
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `column` | `string` | 列名 |
| `op` | `string` | 操作符 |
| `value` | `any` | 条件值，`IS NULL` / `IS NOT NULL` 时无需提供 |
| `value2` | `any` | 第二个值，仅 `BETWEEN` 操作符使用 |

## ConditionGroup

条件组，支持 AND / OR 逻辑组合，可嵌套。

```ts
interface ConditionGroup {
  logic: 'AND' | 'OR'
  items: (Condition | ConditionGroup)[]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `logic` | `'AND' \| 'OR'` | 组内条件的逻辑关系 |
| `items` | `(Condition \| ConditionGroup)[]` | 条件列表，支持嵌套条件组 |

## OrderByItem

排序项。

```ts
interface OrderByItem {
  column: string
  direction: 'ASC' | 'DESC'
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `column` | `string` | 排序列名 |
| `direction` | `'ASC' \| 'DESC'` | 排序方向 |

## TransactionContext

事务上下文，用于编程式事务中手动控制提交和回滚。

```ts
interface TransactionContext {
  connection: Connection
  commit(): Promise<void>
  rollback(): Promise<void>
}
```

| 字段/方法 | 类型 | 说明 |
|-----------|------|------|
| `connection` | `Connection` | 事务绑定的数据库连接 |
| `commit()` | `Promise<void>` | 手动提交事务 |
| `rollback()` | `Promise<void>` | 手动回滚事务 |
