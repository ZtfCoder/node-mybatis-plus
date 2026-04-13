# 方言系统

方言（Dialect）层是 node-mybatis-plus 实现多数据库支持的核心机制。它将不同数据库之间的 SQL 语法差异封装在统一接口背后，使上层的 Wrapper 和 SqlBuilder 无需关心具体数据库类型。

## Dialect 接口定义

```ts
interface Dialect {
  /**
   * 生成参数占位符
   * @param index - 参数序号（从 1 开始）
   * @returns MySQL/SQLite 返回 '?'，PostgreSQL 返回 '$1', '$2' 等
   */
  placeholder(index: number): string;

  /**
   * 引用标识符（表名、列名）
   * @param identifier - 标识符名称
   * @returns MySQL 返回 `name`，PostgreSQL/SQLite 返回 "name"
   */
  quote(identifier: string): string;

  /**
   * 生成分页 SQL
   * @param sql - 原始 SQL 语句
   * @param offset - 偏移量
   * @param limit - 每页数量
   * @returns 添加分页子句后的 SQL
   */
  paginate(sql: string, offset: number, limit: number): string;

  /**
   * 生成 INSERT 返回自增 ID 的 SQL 片段
   * @param table - 表名
   * @param columns - 列名数组
   * @param idColumn - 主键列名
   * @returns PostgreSQL 返回 'RETURNING "id"'，MySQL/SQLite 返回 null
   */
  insertReturningId(table: string, columns: string[], idColumn: string): string | null;
}
```

每个方法对应一个数据库差异点。`SqlBuilder` 在编译 AST 时调用这些方法，而不是硬编码任何数据库特定的语法。

## 三种方言实现

### MysqlDialect

```ts
class MysqlDialect implements Dialect {
  placeholder(_index: number): string {
    return '?';
  }

  quote(identifier: string): string {
    return `\`${identifier}\``;
  }

  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }

  insertReturningId(): null {
    return null;  // MySQL 通过结果对象的 insertId 获取自增 ID
  }
}
```

### PostgresDialect

```ts
class PostgresDialect implements Dialect {
  placeholder(index: number): string {
    return `$${index}`;
  }

  quote(identifier: string): string {
    return `"${identifier}"`;
  }

  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }

  insertReturningId(_table: string, _columns: string[], idColumn: string): string {
    return `RETURNING "${idColumn}"`;
  }
}
```

### SqliteDialect

```ts
class SqliteDialect implements Dialect {
  placeholder(_index: number): string {
    return '?';
  }

  quote(identifier: string): string {
    return `"${identifier}"`;
  }

  paginate(sql: string, offset: number, limit: number): string {
    return `${sql} LIMIT ${limit} OFFSET ${offset}`;
  }

  insertReturningId(): null {
    return null;  // SQLite 通过 lastInsertRowid 获取自增 ID
  }
}
```

## 各数据库差异对比表

| 功能 | MySQL | PostgreSQL | SQLite |
|------|-------|------------|--------|
| 参数占位符 | `?` | `$1, $2, $3` | `?` |
| 标识符引用 | `` `name` `` | `"name"` | `"name"` |
| 分页语法 | `LIMIT N OFFSET M` | `LIMIT N OFFSET M` | `LIMIT N OFFSET M` |
| INSERT 返回 ID | 结果对象 `insertId` | `RETURNING "id"` | 结果对象 `lastInsertRowid` |
| 驱动包 | `mysql2` | `pg` | `better-sqlite3` |
| 连接模式 | 连接池（异步） | 连接池（异步） | 单文件（同步） |
| 布尔类型 | `TINYINT(1)` | `BOOLEAN` | `INTEGER` |

:::tip 分页语法
虽然三种数据库的分页语法看起来相同（都是 `LIMIT N OFFSET M`），但将其抽象为 `Dialect.paginate()` 方法是为了未来扩展。如果需要支持 SQL Server 等使用不同分页语法的数据库，只需实现新的方言类即可。
:::

## createDialect 工厂方法

`createDialect` 是一个简单的工厂函数，根据数据库类型字符串创建对应的方言实例：

```ts
function createDialect(type: string): Dialect {
  switch (type) {
    case 'mysql':    return new MysqlDialect();
    case 'postgres': return new PostgresDialect();
    case 'sqlite':   return new SqliteDialect();
    default: throw new Error(`Unsupported dialect: ${type}`);
  }
}
```

## 自动选择机制

用户在创建数据源时通过 `type` 字段指定数据库类型，框架自动选择对应的方言：

```ts
const ds = createDataSource({
  type: 'mysql',  // ← 自动选择 MysqlDialect
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '***',
});
```

`createDataSource` 内部根据 `config.type` 创建对应的 DataSource 实现，每个 DataSource 实现在构造函数中调用 `createDialect(type)` 初始化方言：

```ts
class MysqlDataSource implements DataSource {
  dialect: Dialect;

  constructor(config: DataSourceConfig) {
    this.dialect = createDialect('mysql');
    // ...
  }
}
```

方言实例通过 `DataSource.dialect` 属性暴露，`SqlBuilder` 在编译时使用：

```ts
const builder = new SqlBuilder(ds.dialect);
const { sql, params } = builder.build(node);
```

整个流程中，用户只需指定 `type: 'mysql' | 'postgres' | 'sqlite'`，框架自动完成方言选择、SQL 编译和数据库驱动调用，实现一套代码切换多数据库。
