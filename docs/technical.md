# node-mybatis-plus 技术方案

## 1. 技术选型

| 模块 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript 5.x | 泛型 + 装饰器实现类型安全 |
| MySQL 驱动 | mysql2 | 支持 Promise、连接池、预编译 |
| PostgreSQL 驱动 | pg | 主流 PG 驱动 |
| SQLite 驱动 | better-sqlite3 | 高性能同步 SQLite 驱动 |
| 元数据 | reflect-metadata | 装饰器元数据存储 |
| 构建 | tsup | 轻量，同时输出 CJS/ESM |
| 测试 | vitest | 快速、TS 原生支持 |

## 2. 整体架构

```
┌─────────────────────────────────────────────────┐
│                  用户代码层                        │
│   UserMapper.lambdaQuery().eq(...).list()        │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Wrapper 层（条件构造器）               │
│   LambdaQueryWrapper / LambdaUpdateWrapper       │
│   收集条件 → 生成 Condition[]                     │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              SQL Builder 层                       │
│   Condition[] + EntityMeta → 抽象 SQL AST        │
│   动态 SQL 模板解析也在此层                        │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Dialect 层（方言）                    │
│   抽象 SQL AST → 具体数据库 SQL 字符串             │
│   MySQL / PostgreSQL / SQLite                    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Plugin 层（插件链）                   │
│   分页 / 软删除 / 乐观锁 / 日志                   │
│   拦截 SQL 执行前后，修改或增强行为                  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Executor 层（执行器）                 │
│   接收最终 SQL + params，调用数据库驱动执行          │
│   管理连接获取、结果映射                            │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              DataSource 层（数据源）               │
│   连接池管理 / 多数据源 / 事务连接隔离              │
│   mysql2.createPool / pg.Pool / better-sqlite3   │
└─────────────────────────────────────────────────┘
```

数据流：`用户调用 → Wrapper 收集条件 → Builder 构建 AST → Dialect 生成 SQL → Plugin 拦截增强 → Executor 执行 → DataSource 获取连接`

## 3. SQL 解析与构建

### 3.1 内部 SQL AST 表示

不直接拼字符串，而是先构建一个中间 AST，再由 Dialect 层翻译为具体 SQL。这样做的好处是：
- 方言差异在 Dialect 层统一处理
- 插件可以在 AST 层面修改 SQL（如分页插件添加 LIMIT）
- 便于 SQL 日志格式化输出

```ts
// SQL AST 节点定义
interface SqlNode {
  type: 'select' | 'insert' | 'update' | 'delete';
}

interface SelectNode extends SqlNode {
  type: 'select';
  table: string;
  columns: string[];          // ['user_name', 'age'] 或 ['*']
  where: ConditionGroup;      // WHERE 条件树
  orderBy: OrderByItem[];
  groupBy: string[];
  having: ConditionGroup | null;
  limit: { offset: number; count: number } | null;
}

interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: (Condition | ConditionGroup)[];  // 支持嵌套
}

interface Condition {
  column: string;             // 数据库列名（已经过映射）
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN' | 'NOT IN'
      | 'BETWEEN' | 'IS NULL' | 'IS NOT NULL';
  value: any;                 // 参数值，IS NULL 时为 undefined
  value2?: any;               // BETWEEN 的第二个值
}
```

### 3.2 Wrapper → AST 转换流程

```
1. 用户调用 wrapper.eq('userName', '张三')
2. Wrapper 内部存储: { field: 'userName', op: '=', value: '张三' }
3. 调用 list() 时触发构建：
   a. 通过 EntityMeta 将 field 'userName' 映射为 column 'user_name'
   b. 组装 SelectNode { table: 'sys_user', columns: [...], where: {...} }
4. 传给 Dialect 生成最终 SQL
```

### 3.3 参数绑定

统一使用 `#{param}` 占位符语法，由 Dialect 层转换：

```ts
// 输入
'SELECT * FROM user WHERE name = #{name} AND age > #{age}'

// MySQL 输出
{ sql: 'SELECT * FROM user WHERE name = ? AND age > ?', params: ['张三', 18] }

// PostgreSQL 输出
{ sql: 'SELECT * FROM user WHERE name = $1 AND age > $2', params: ['张三', 18] }
```

实现方式：正则匹配 `#{xxx}` 提取参数名，按顺序替换为占位符，同时收集参数值数组。

```ts
function parseParams(sql: string, params: Record<string, any>, dialect: Dialect): ParsedSql {
  const values: any[] = [];
  let index = 0;
  const parsed = sql.replace(/#\{(\w+)\}/g, (_, key) => {
    values.push(params[key]);
    return dialect.placeholder(++index);  // MySQL: '?', PG: '$1'
  });
  return { sql: parsed, params: values };
}
```

## 4. 动态 SQL 模板解析

### 4.1 支持的标签

| 标签 | 功能 | 示例 |
|------|------|------|
| `<if test="...">` | 条件判断 | `<if test="name != null">AND name = #{name}</if>` |
| `<where>` | 自动处理 WHERE 和多余的 AND/OR | 包裹条件块 |
| `<set>` | 自动处理 SET 和多余的逗号 | UPDATE 语句 |
| `<foreach>` | 循环 | IN 列表 |
| `<choose>/<when>/<otherwise>` | 多分支 | 类似 switch-case |
| `<trim>` | 自定义前后缀裁剪 | 通用裁剪 |

### 4.2 解析流程

```
模板字符串
    │
    ▼
XML 解析器（轻量级，自己实现或用 fast-xml-parser）
    │
    ▼
标签节点树（TagNode[]）
    │
    ▼
求值引擎（根据传入参数计算 test 表达式）
    │
    ▼
拼接最终 SQL 片段
    │
    ▼
参数绑定处理
    │
    ▼
最终 SQL + params
```

### 4.3 表达式求值

`<if test="...">` 中的表达式需要安全求值：

```ts
// 安全的表达式求值器，只支持简单比较
function evaluate(expr: string, context: Record<string, any>): boolean {
  // 支持的表达式：
  // name != null
  // age > 18
  // status == 1
  // name != null and age > 0
  // list != null and list.length > 0
}
```

不使用 `eval()`，而是自己实现一个简单的表达式解析器，只支持：
- 比较运算：`==` `!=` `>` `>=` `<` `<=`
- 逻辑运算：`and` `or` `not`
- 空值判断：`!= null` `== null`
- 属性访问：`obj.prop`

### 4.4 `<foreach>` 实现

```ts
// 模板
`<foreach collection="ids" item="id" open="(" separator="," close=")">
  #{id}
</foreach>`

// 输入: { ids: [1, 2, 3] }
// 输出: (?, ?, ?)  params: [1, 2, 3]
```

## 5. 多数据库兼容（Dialect 方言层）

### 5.1 方言接口

```ts
interface Dialect {
  // 占位符：MySQL → '?', PG → '$N'
  placeholder(index: number): string;

  // 分页语法
  paginate(sql: string, offset: number, limit: number): string;

  // 标识符引用：MySQL → `col`, PG → "col"
  quote(identifier: string): string;

  // 插入返回自增 ID 的处理
  insertReturningId(sql: string, idColumn: string): string;

  // 批量插入语法
  batchInsert(table: string, columns: string[], rows: any[][]): { sql: string; params: any[] };

  // UPSERT 语法
  upsert(table: string, columns: string[], conflictKeys: string[]): string;

  // 类型映射（JS 类型 → DB 类型）
  mapType(jsType: string): string;
}
```

### 5.2 各数据库差异处理

| 功能 | MySQL | PostgreSQL | SQLite |
|------|-------|------------|--------|
| 占位符 | `?` | `$1, $2` | `?` |
| 标识符引用 | `` `col` `` | `"col"` | `"col"` |
| 分页 | `LIMIT N OFFSET M` | `LIMIT N OFFSET M` | `LIMIT N OFFSET M` |
| 自增 ID 返回 | `insertId` from result | `RETURNING id` | `lastInsertRowid` |
| UPSERT | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT DO UPDATE` | `ON CONFLICT DO UPDATE` |
| 布尔类型 | TINYINT(1) | BOOLEAN | INTEGER |
| JSON 类型 | JSON | JSONB | TEXT |

### 5.3 方言注册与自动检测

```ts
// 通过连接配置自动选择方言
const datasource = createDataSource({
  type: 'mysql',  // 自动选择 MysqlDialect
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '***',
  pool: { min: 2, max: 10 }
});

// 也支持手动注册自定义方言
registerDialect('custom-db', new CustomDialect());
```

## 6. 事务管理

### 6.1 编程式事务

```ts
// 方式一：手动管理
const tx = await datasource.beginTransaction();
try {
  await userMapper.insert(user, { transaction: tx });
  await orderMapper.insert(order, { transaction: tx });
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
}

// 方式二：自动管理（推荐）
await datasource.transaction(async (tx) => {
  await userMapper.insert(user, { transaction: tx });
  await orderMapper.insert(order, { transaction: tx });
  // 正常结束自动 commit，抛异常自动 rollback
});
```

### 6.2 事务传播（基于 AsyncLocalStorage）

使用 Node.js 的 `AsyncLocalStorage` 实现事务上下文自动传播，避免手动传递 tx 对象：

```ts
import { AsyncLocalStorage } from 'async_hooks';

const txStore = new AsyncLocalStorage<TransactionContext>();

// 开启事务上下文
await withTransaction(async () => {
  // 在这个作用域内的所有 Mapper 操作自动使用同一个事务连接
  await userMapper.insert(user);    // 自动感知事务
  await orderMapper.insert(order);  // 同一个事务
});

// Executor 内部实现
class Executor {
  async execute(sql: string, params: any[]) {
    // 优先从 AsyncLocalStorage 获取事务连接
    const txCtx = txStore.getStore();
    const conn = txCtx ? txCtx.connection : await this.datasource.getConnection();
    // ...
  }
}
```

### 6.3 事务隔离级别

```ts
await datasource.transaction(async (tx) => {
  // ...
}, {
  isolationLevel: 'READ_COMMITTED'  // 默认
  // 可选: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE'
});
```

### 6.4 嵌套事务

通过 Savepoint 支持嵌套事务：

```ts
await datasource.transaction(async () => {
  await userMapper.insert(user1);

  // 嵌套事务 → 自动创建 SAVEPOINT
  await datasource.transaction(async () => {
    await userMapper.insert(user2);
    // 如果这里抛异常，只回滚到 SAVEPOINT，不影响外层
  });

  await userMapper.insert(user3);
});
```

## 7. 连接池管理

### 7.1 连接池配置

```ts
interface PoolConfig {
  min: number;           // 最小连接数，默认 2
  max: number;           // 最大连接数，默认 10
  idleTimeout: number;   // 空闲连接超时（ms），默认 30000
  acquireTimeout: number; // 获取连接超时（ms），默认 10000
  maxRetries: number;    // 连接失败重试次数，默认 3
}
```

### 7.2 连接生命周期

```
创建连接 → 放入空闲池
    │
获取连接 ← 从空闲池取出（或新建）
    │
执行 SQL
    │
归还连接 → 放回空闲池
    │
空闲超时 → 销毁连接
```

### 7.3 多数据源

```ts
const masterDs = createDataSource({ type: 'mysql', host: 'master', ... });
const slaveDs = createDataSource({ type: 'mysql', host: 'slave', ... });

// 读写分离
const userMapper = new UserMapper(User, {
  write: masterDs,
  read: slaveDs
});

// 查询自动走从库，写入自动走主库
await userMapper.selectList();  // → slave
await userMapper.insert(user);  // → master
```

## 8. 插件系统

### 8.1 插件接口

```ts
interface Plugin {
  name: string;
  order: number;  // 执行顺序

  // SQL 执行前拦截
  beforeExecute?(context: PluginContext): Promise<void>;

  // SQL 执行后拦截
  afterExecute?(context: PluginContext, result: any): Promise<any>;
}

interface PluginContext {
  sqlNode: SqlNode;        // SQL AST，可修改
  sql: string;             // 最终 SQL
  params: any[];           // 参数
  entityMeta: EntityMeta;  // 实体元数据
  dialect: Dialect;        // 数据库方言（可用于生成兼容的占位符和引号）
  operation: 'select' | 'insert' | 'update' | 'delete';
}
```

### 8.2 内置插件

**分页插件**：拦截 SELECT，自动添加 COUNT 查询和 LIMIT/OFFSET

```ts
class PaginationPlugin implements Plugin {
  name = 'pagination';
  order = 10;

  async beforeExecute(ctx: PluginContext) {
    if (ctx.sqlNode.type === 'select' && ctx.sqlNode.limit) {
      // 1. 生成 COUNT SQL
      // 2. 修改原 SQL 添加 LIMIT OFFSET（通过 Dialect）
    }
  }
}
```

**软删除插件**：自动将 DELETE 转为 UPDATE，SELECT 自动加 deleted=0 条件

```ts
class SoftDeletePlugin implements Plugin {
  name = 'soft-delete';
  order = 5;

  async beforeExecute(ctx: PluginContext) {
    if (ctx.operation === 'delete') {
      // 将 DELETE 转为 UPDATE SET deleted=1
    }
    if (ctx.operation === 'select') {
      // 自动追加 WHERE deleted=0
    }
  }
}
```

**SQL 日志插件**：打印执行的 SQL 和耗时

**乐观锁插件**：UPDATE 时自动检查 version 字段

### 8.3 插件注册

```ts
const datasource = createDataSource({
  type: 'mysql',
  // ...
  plugins: [
    new PaginationPlugin(),
    new SoftDeletePlugin({ column: 'deleted' }),
    new SqlLogPlugin({ slow: 1000 }),  // 慢查询阈值 1s
  ]
});
```

## 9. 实体元数据系统

### 9.1 元数据收集

装饰器执行时，通过 `reflect-metadata` 存储元数据：

```ts
interface EntityMeta {
  tableName: string;
  columns: ColumnMeta[];
  idColumn: ColumnMeta;
}

interface ColumnMeta {
  propertyName: string;   // JS 属性名: 'userName'
  columnName: string;     // DB 列名: 'user_name'
  isPrimary: boolean;
  idType: 'auto' | 'uuid' | 'snowflake' | 'input';
  exist: boolean;         // 是否为数据库字段
  typeHandler?: TypeHandler;  // 自定义类型转换
}
```

### 9.2 命名策略

默认 camelCase → snake_case 自动转换，可自定义：

```ts
const datasource = createDataSource({
  // ...
  namingStrategy: 'camelToSnake',  // 默认
  // 或自定义
  namingStrategy: (propertyName: string) => propertyName.toLowerCase(),
});
```

## 10. 结果映射

### 10.1 自动映射

查询结果自动从 snake_case 列名映射到 camelCase 属性名：

```ts
// DB 返回: { user_name: '张三', create_time: '2024-01-01' }
// 映射为: { userName: '张三', createTime: '2024-01-01' }
```

### 10.2 TypeHandler 自定义类型转换

```ts
// 注册自定义类型处理器
class JsonTypeHandler implements TypeHandler<object> {
  toDb(value: object): string {
    return JSON.stringify(value);
  }
  fromDb(value: string): object {
    return JSON.parse(value);
  }
}

@Table('user')
class User {
  @Column({ typeHandler: new JsonTypeHandler() })
  settings: object;
}
```

## 11. 错误处理

### 11.1 统一异常体系

```ts
class MybatisPlusError extends Error {
  code: string;
}

class ConnectionError extends MybatisPlusError { code = 'CONNECTION_ERROR'; }
class QueryError extends MybatisPlusError { code = 'QUERY_ERROR'; }
class MappingError extends MybatisPlusError { code = 'MAPPING_ERROR'; }
class TransactionError extends MybatisPlusError { code = 'TRANSACTION_ERROR'; }
class ValidationError extends MybatisPlusError { code = 'VALIDATION_ERROR'; }
```

### 11.2 连接重试

```ts
// 连接失败自动重试，指数退避
async getConnection(retries = 3, delay = 100): Promise<Connection> {
  for (let i = 0; i < retries; i++) {
    try {
      return await this.pool.getConnection();
    } catch (e) {
      if (i === retries - 1) throw new ConnectionError(e.message);
      await sleep(delay * Math.pow(2, i));
    }
  }
}
```

## 12. 性能考量

| 点 | 策略 |
|----|------|
| 元数据缓存 | 装饰器解析结果全局缓存，只解析一次 |
| SQL 缓存 | 相同 Wrapper 结构的 SQL 模板缓存（参数不同但结构相同） |
| 连接池 | 复用连接，避免频繁创建销毁 |
| 批量操作 | insertBatch 使用单条 INSERT 多 VALUES，减少网络往返 |
| 预编译 | 所有 SQL 使用参数绑定，数据库可缓存执行计划 |
| 动态 SQL 模板 | 解析后的标签树缓存，避免重复 XML 解析 |

## 13. 完整使用示例

```ts
import { createDataSource, Table, Column, Id, BaseMapper, PaginationPlugin } from 'node-mybatis-plus';

// 1. 配置数据源
const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '***',
  pool: { min: 2, max: 10 },
  plugins: [new PaginationPlugin()]
});

// 2. 定义实体
@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id: number;

  @Column('user_name')
  userName: string;

  @Column()
  age: number;

  @Column()
  email: string;
}

// 3. 创建 Mapper
class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);

// 4. CRUD
await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });

// 5. Lambda 链式查询
const users = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .ge('age', 18)
  .orderByDesc('id')
  .page(1, 10)
  .list();

// 6. 事务
await ds.transaction(async () => {
  await userMapper.insert({ userName: '李四', age: 25, email: 'ls@test.com' });
  await userMapper.lambdaUpdate()
    .set('age', 26)
    .eq('userName', '李四')
    .execute();
});

// 7. 关闭
await ds.close();
```
