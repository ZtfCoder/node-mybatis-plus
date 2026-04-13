# 数据源配置

数据源是 node-mybatis-plus 连接数据库的核心组件。通过 `createDataSource` 工厂函数创建，支持 MySQL、PostgreSQL 和 SQLite。

## createDataSource

工厂函数，根据配置创建对应类型的数据源实例。

```ts
function createDataSource(config: DataSourceConfig): DataSource
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `DataSourceConfig` | 数据源配置对象 |

```ts
import { createDataSource } from 'node-mybatis-plus'

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: '123456',
  pool: { min: 2, max: 10 },
  plugins: [],
})
```

## DataSourceConfig

数据源配置接口，定义连接数据库所需的全部参数。

```ts
interface DataSourceConfig {
  type: 'mysql' | 'postgres' | 'sqlite'
  host?: string
  port?: number
  database: string
  username?: string
  password?: string
  pool?: PoolConfig
  plugins?: Plugin[]
  namingStrategy?: 'camelToSnake' | ((name: string) => string)
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `type` | `'mysql' \| 'postgres' \| 'sqlite'` | 是 | — | 数据库类型 |
| `host` | `string` | 否 | `'localhost'` | 数据库主机地址 |
| `port` | `number` | 否 | MySQL: `3306`，PostgreSQL: `5432` | 数据库端口 |
| `database` | `string` | 是 | — | 数据库名称（SQLite 为文件路径） |
| `username` | `string` | 否 | — | 数据库用户名 |
| `password` | `string` | 否 | — | 数据库密码 |
| `pool` | `PoolConfig` | 否 | — | 连接池配置 |
| `plugins` | `Plugin[]` | 否 | `[]` | 插件列表 |
| `namingStrategy` | `'camelToSnake' \| ((name: string) => string)` | 否 | `'camelToSnake'` | 命名策略，属性名到列名的转换规则 |

## PoolConfig

连接池配置接口。

```ts
interface PoolConfig {
  min?: number
  max?: number
  idleTimeout?: number
  acquireTimeout?: number
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `min` | `number` | `2` | 最小连接数 |
| `max` | `number` | `10` | 最大连接数 |
| `idleTimeout` | `number` | `30000` | 空闲连接超时时间（毫秒） |
| `acquireTimeout` | `number` | — | 获取连接超时时间（毫秒） |

## DataSource

数据源接口，提供数据库操作的核心方法。

```ts
interface DataSource {
  config: DataSourceConfig
  dialect: Dialect
  plugins: Plugin[]
  getConnection(): Promise<Connection>
  execute(sql: string, params: any[]): Promise<any>
  close(): Promise<void>
  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>
}
```

| 方法/属性 | 类型 | 说明 |
|-----------|------|------|
| `config` | `DataSourceConfig` | 数据源配置 |
| `dialect` | `Dialect` | 数据库方言实例 |
| `plugins` | `Plugin[]` | 已注册的插件列表 |
| `getConnection()` | `Promise<Connection>` | 从连接池获取一个连接 |
| `execute(sql, params)` | `Promise<any>` | 执行 SQL 语句 |
| `close()` | `Promise<void>` | 关闭数据源，释放连接池 |
| `transaction(fn)` | `Promise<T>` | 编程式事务，回调内的操作在同一事务中执行 |

### execute

执行 SQL 语句，自动处理事务上下文。如果当前处于事务中，会复用事务连接。

```ts
const rows = await ds.execute('SELECT * FROM sys_user WHERE id = ?', [1])
```

### transaction

编程式事务管理，回调函数中可通过 `TransactionContext` 手动控制提交和回滚。

```ts
await ds.transaction(async (tx) => {
  await tx.connection.query('INSERT INTO sys_user (name) VALUES (?)', ['张三'])
  await tx.connection.query('INSERT INTO sys_log (action) VALUES (?)', ['create'])
  // 回调正常结束自动提交，抛出异常自动回滚
})
```

## Connection

数据库连接接口。

```ts
interface Connection {
  query(sql: string, params: any[]): Promise<any>
  release(): void
}
```

| 方法 | 类型 | 说明 |
|------|------|------|
| `query(sql, params)` | `Promise<any>` | 执行 SQL 查询 |
| `release()` | `void` | 释放连接回连接池 |

::: warning 注意
通过 `getConnection()` 获取的连接必须在使用完毕后调用 `release()` 释放，否则会导致连接池耗尽。推荐使用 `execute()` 或 `transaction()` 方法，它们会自动管理连接生命周期。
:::
