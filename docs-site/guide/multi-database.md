# 多数据库切换

node-mybatis-plus 支持 MySQL、PostgreSQL 和 SQLite 三种数据库。切换数据库只需修改 `DataSourceConfig.type`，方言层会自动处理不同数据库之间的语法差异。

## 切换数据库类型

只需修改 `type` 字段和对应的连接参数即可：

```ts
import { createDataSource } from 'node-mybatis-plus';

// MySQL
const mysqlDs = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: '******',
});

// PostgreSQL
const pgDs = createDataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  password: '******',
});

// SQLite
const sqliteDs = createDataSource({
  type: 'sqlite',
  database: './data.db',  // 文件路径，或 ':memory:' 使用内存数据库
});
```

上层代码（实体定义、Mapper、查询构造器）完全不需要改动：

```ts
// 同一套代码，切换数据源即可
class UserMapper extends BaseMapper<User> {}

const userMapper = new UserMapper(User, mysqlDs);  // 用 MySQL
// const userMapper = new UserMapper(User, pgDs);   // 换成 PostgreSQL
// const userMapper = new UserMapper(User, sqliteDs); // 换成 SQLite

// 查询代码完全一样
const users = await userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByDesc('id')
  .list();
```

## 方言层自动处理的差异

框架内部通过 `Dialect` 接口抽象数据库差异，开发者无需关心底层细节。以下是三种数据库的主要差异对比：

| 特性 | MySQL | PostgreSQL | SQLite |
|------|-------|------------|--------|
| 占位符 | `?` | `$1`, `$2`, ... | `?` |
| 标识符引用 | `` `backtick` `` | `"double quote"` | `"double quote"` |
| 分页语法 | `LIMIT n OFFSET m` | `LIMIT n OFFSET m` | `LIMIT n OFFSET m` |
| 自增主键返回 | `insertId`（驱动返回） | `RETURNING "id"` | `lastInsertRowid`（驱动返回） |
| 数据库驱动 | `mysql2` | `pg` | `better-sqlite3` |

### 占位符差异

同一条查询在不同数据库中生成的 SQL：

```sql
-- MySQL / SQLite
SELECT `id`, `user_name` FROM `sys_user` WHERE `age` >= ? AND `status` = ?

-- PostgreSQL
SELECT "id", "user_name" FROM "sys_user" WHERE "age" >= $1 AND "status" = $2
```

### 标识符引用差异

MySQL 使用反引号，PostgreSQL 和 SQLite 使用双引号：

```sql
-- MySQL
SELECT `user_name`, `created_at` FROM `sys_user`

-- PostgreSQL / SQLite
SELECT "user_name", "created_at" FROM "sys_user"
```

### 自增主键返回差异

插入数据后获取自增 ID 的方式因数据库而异，框架自动处理：

```ts
// 开发者代码（三种数据库通用）
const id = await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
console.log(id); // 自增 ID
```

框架内部处理：
- MySQL：从执行结果的 `insertId` 字段获取
- PostgreSQL：在 INSERT 语句末尾追加 `RETURNING "id"` 子句
- SQLite：从执行结果的 `lastInsertRowid` 字段获取

## createDialect 工厂方法

框架通过 `createDialect` 工厂方法根据数据库类型创建对应的方言实例：

```ts
import { createDialect } from 'node-mybatis-plus';

const mysqlDialect = createDialect('mysql');
const pgDialect = createDialect('postgres');
const sqliteDialect = createDialect('sqlite');
```

`Dialect` 接口定义：

```ts
interface Dialect {
  /** 生成参数占位符，index 从 1 开始 */
  placeholder(index: number): string;

  /** 引用标识符（表名、列名） */
  quote(identifier: string): string;

  /** 生成分页 SQL */
  paginate(sql: string, offset: number, limit: number): string;

  /** 生成 INSERT RETURNING 子句（仅 PostgreSQL 支持） */
  insertReturningId(table: string, columns: string[], idColumn: string): string | null;
}
```

::: tip
通常你不需要直接使用 `createDialect`，框架在创建 `DataSource` 时会自动根据 `type` 选择正确的方言。这里列出是为了帮助理解内部机制。
:::

## Dialect 方法对比

| 方法 | MySQL | PostgreSQL | SQLite |
|------|-------|------------|--------|
| `placeholder(1)` | `?` | `$1` | `?` |
| `quote('user_name')` | `` `user_name` `` | `"user_name"` | `"user_name"` |
| `paginate(sql, 0, 10)` | `sql LIMIT 10 OFFSET 0` | `sql LIMIT 10 OFFSET 0` | `sql LIMIT 10 OFFSET 0` |
| `insertReturningId(...)` | `null` | `RETURNING "id"` | `null` |

## 安装数据库驱动

根据使用的数据库类型安装对应驱动：

```bash
# MySQL
npm install mysql2

# PostgreSQL
npm install pg

# SQLite
npm install better-sqlite3
```

::: warning
只需安装实际使用的数据库驱动。框架采用动态 `import`，未安装的驱动不会影响其他数据库的使用。
:::

## 下一步

- [数据源配置](/guide/datasource) — 连接池配置和数据源管理
- [事务管理](/guide/transaction) — 编程式事务和声明式事务
