# 架构概览

node-mybatis-plus 采用分层架构设计，将用户调用到 SQL 执行的完整流程拆分为多个职责清晰的层次。每一层只关注自身的核心逻辑，通过接口与上下层解耦。

## 分层架构图

```
┌─────────────────────────────────────────────────┐
│                  用户代码层                        │
│   UserMapper.lambdaQuery().eq(...).list()        │
└──────────────────────┬──────────────────────────┘
                       │  调用链式 API
                       ▼
┌─────────────────────────────────────────────────┐
│              Wrapper 层（条件构造器）               │
│   LambdaQueryWrapper / LambdaUpdateWrapper       │
│   收集条件 → 生成 ConditionGroup                  │
└──────────────────────┬──────────────────────────┘
                       │  构建 AST 节点
                       ▼
┌─────────────────────────────────────────────────┐
│              SqlBuilder 层（SQL 编译器）           │
│   SqlNode AST → CompiledSql { sql, params }     │
│   遍历 AST 节点，调用 Dialect 生成占位符和引用      │
└──────────────────────┬──────────────────────────┘
                       │  生成最终 SQL + 参数
                       ▼
┌─────────────────────────────────────────────────┐
│              Dialect 层（数据库方言）               │
│   placeholder() / quote() / paginate()          │
│   MySQL / PostgreSQL / SQLite 差异处理            │
└──────────────────────┬──────────────────────────┘
                       │  SQL 字符串
                       ▼
┌─────────────────────────────────────────────────┐
│              Plugin 层（插件链）                   │
│   beforeExecute → SQL 执行 → afterExecute        │
│   日志 / 审计 / SQL 改写                          │
└──────────────────────┬──────────────────────────┘
                       │  执行 SQL
                       ▼
┌─────────────────────────────────────────────────┐
│              DataSource 层（数据源）               │
│   连接池管理 / 事务连接隔离 / SQL 执行             │
│   mysql2 / pg / better-sqlite3                   │
└─────────────────────────────────────────────────┘
```

## 数据流说明

从用户调用到 SQL 执行的完整流程如下：

### 1. 用户发起调用

```ts
const users = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .ge('age', 18)
  .orderByDesc('id')
  .list();
```

用户通过 `BaseMapper.lambdaQuery()` 获取一个绑定了数据源的 `LambdaQueryWrapper` 实例，然后通过链式调用添加查询条件。

### 2. Wrapper 收集条件

每次调用 `.eq()`、`.ge()` 等方法时，Wrapper 内部将条件存储到 `ConditionGroup` 结构中：

```ts
// Wrapper 内部状态
conditionGroup = {
  logic: 'AND',
  items: [
    { column: 'user_name', op: '=', value: '张三' },
    { column: 'age', op: '>=', value: 18 }
  ]
}
```

字段名通过 `EntityMeta` 自动从 camelCase 属性名映射为 snake_case 列名。

### 3. 构建 SQL AST

调用终结方法 `.list()` 时，Wrapper 调用 `buildSelectNode()` 将收集到的条件组装为 `SelectNode` AST：

```ts
const node: SelectNode = {
  type: 'select',
  table: 'sys_user',
  columns: [],           // 空数组表示 SELECT *
  where: conditionGroup,
  orderBy: [{ column: 'id', direction: 'DESC' }],
  groupBy: [],
  having: null,
  limit: null
}
```

### 4. SqlBuilder 编译 SQL

`SqlBuilder` 接收 AST 节点和 `Dialect` 实例，遍历节点树生成 SQL 字符串和参数数组：

```ts
const builder = new SqlBuilder(dialect);
const { sql, params } = builder.build(node);
// MySQL:  sql = "SELECT * FROM `sys_user` WHERE `user_name` = ? AND `age` >= ? ORDER BY `id` DESC"
//         params = ['张三', 18]
// PG:     sql = 'SELECT * FROM "sys_user" WHERE "user_name" = $1 AND "age" >= $2 ORDER BY "id" DESC'
//         params = ['张三', 18]
```

### 5. 插件链拦截

如果 DataSource 注册了插件，`runPlugins` 函数按 `order` 排序后依次执行：

```
beforeExecute(plugin1) → beforeExecute(plugin2) → 执行 SQL → afterExecute(plugin2) → afterExecute(plugin1)
```

插件可以在 `beforeExecute` 中修改 `ctx.sql` 和 `ctx.params`，在 `afterExecute` 中处理或替换返回结果。

### 6. DataSource 执行 SQL

DataSource 通过连接池获取数据库连接，执行最终的 SQL 语句。如果当前处于事务上下文中（通过 `AsyncLocalStorage` 检测），则自动使用事务连接。

```
获取连接 → 执行 SQL → 返回结果 → 释放连接
```

## 各层职责

### Wrapper 层（条件收集）

| 职责 | 说明 |
|------|------|
| 链式 API | 提供 `eq`/`ne`/`gt`/`like`/`in` 等条件方法，支持链式调用 |
| 动态条件 | 第一个参数为 `boolean` 时，`false` 自动跳过该条件 |
| 字段映射 | 通过 `EntityMeta` 将属性名转换为数据库列名 |
| AST 构建 | 终结方法触发时，将收集的条件组装为 `SqlNode` AST |
| 终结操作 | `list()`/`one()`/`count()`/`pageResult()` 触发实际查询 |

核心类：
- `AbstractWrapper<T, Self>` — 条件构造器基类，实现所有条件方法
- `LambdaQueryWrapper<T>` — 查询条件构造器，构建 `SelectNode`
- `LambdaUpdateWrapper<T>` — 更新条件构造器，构建 `UpdateNode`

### SqlBuilder 层（AST 构建和编译）

| 职责 | 说明 |
|------|------|
| AST 遍历 | 递归遍历 `SqlNode` 的各个字段 |
| SQL 生成 | 根据节点类型生成 SELECT/INSERT/UPDATE/DELETE 语句 |
| 参数收集 | 通过 `addParam()` 方法收集参数值，生成占位符 |
| 方言适配 | 调用 `Dialect.placeholder()` 和 `Dialect.quote()` 处理数据库差异 |

核心类：
- `SqlBuilder` — 接收 `Dialect` 实例，将 `SqlNode` 编译为 `CompiledSql { sql, params }`

### Dialect 层（数据库差异处理）

| 职责 | 说明 |
|------|------|
| 占位符生成 | MySQL/SQLite 使用 `?`，PostgreSQL 使用 `$1, $2` |
| 标识符引用 | MySQL 使用反引号 `` ` ``，PostgreSQL/SQLite 使用双引号 `"` |
| 分页语法 | 各数据库的 `LIMIT/OFFSET` 语法处理 |
| INSERT 返回 ID | PostgreSQL 使用 `RETURNING`，MySQL/SQLite 从结果对象获取 |

核心类：
- `MysqlDialect` / `PostgresDialect` / `SqliteDialect` — 三种方言实现
- `createDialect(type)` — 工厂方法，根据数据库类型创建对应方言

### Plugin 层（执行前后钩子）

| 职责 | 说明 |
|------|------|
| 执行前拦截 | `beforeExecute` 可修改 SQL、参数或 AST 节点 |
| 执行后处理 | `afterExecute` 可处理或替换查询结果 |
| 排序执行 | 按 `order` 字段排序，保证插件执行顺序可控 |

核心函数：
- `runPlugins(ds, node, sql, params, entityMeta)` — 插件执行器

### DataSource 层（连接池管理和 SQL 执行）

| 职责 | 说明 |
|------|------|
| 连接池 | 管理数据库连接的创建、复用和销毁 |
| SQL 执行 | 通过连接执行 SQL 语句并返回结果 |
| 事务感知 | 检测 `AsyncLocalStorage` 中的事务上下文，自动使用事务连接 |
| 资源释放 | 提供 `close()` 方法关闭连接池 |

核心类：
- `MysqlDataSource` / `PostgresDataSource` / `SqliteDataSource` — 三种数据源实现
- `createDataSource(config)` — 工厂方法，根据配置创建对应数据源
