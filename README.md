# node-mybatis-plus

MyBatis-Plus 风格的 Node.js ORM 库，为 TypeScript 开发者提供类型安全的链式查询、动态 SQL 和通用 CRUD 能力。

> 如果你用过 Java 的 MyBatis-Plus，那你已经会用了。

📖 [官方文档](https://ztfcoder.github.io/node-mybatis-plus/)

## ✨ 特性

- 🔗 **Lambda 链式查询** — 类型安全的条件构造器，IDE 自动补全字段名
- 🎯 **动态 SQL** — 条件为 false 时自动跳过，告别 if-else 拼 SQL
- 🗄️ **多数据库支持** — MySQL / PostgreSQL / SQLite，一套代码切换数据库
- 📦 **通用 CRUD** — BaseMapper 内置 insert / delete / update / select 全家桶
- 💉 **声明式事务** — `@Transactional` 装饰器 + AsyncLocalStorage 自动传播
- 📝 **自定义 SQL** — `#{param}` 命名参数绑定，防 SQL 注入
- 🎨 **装饰器映射** — `@Table` `@Column` `@Id` 定义实体，自动 camelCase → snake_case
- 🔌 **插件机制** — beforeExecute / afterExecute 钩子，支持日志、审计、SQL 改写、慢查询监控

## 📦 安装

```bash
npm install node-mybatis-plus reflect-metadata
```

按需安装数据库驱动：

```bash
# MySQL
npm install mysql2

# PostgreSQL
npm install pg

# SQLite
npm install better-sqlite3
```

## 🚀 快速开始

### 1. 定义实体

```ts
import 'reflect-metadata';
import { Table, Column, Id } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id: number;

  @Column('user_name')  // 指定列名
  userName: string;

  @Column()  // 自动转为 snake_case → age
  age: number;

  @Column()
  email: string;
}
```

### 2. 创建数据源和 Mapper

```ts
import { createDataSource, BaseMapper } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',  // 'mysql' | 'postgres' | 'sqlite'
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '******',
});

class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);
```

### 3. CRUD 操作

```ts
// 新增
const id = await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });

// 批量新增
await userMapper.insertBatch([
  { userName: '李四', age: 25, email: 'ls@test.com' },
  { userName: '王五', age: 30, email: 'ww@test.com' },
]);

// 查询
const user = await userMapper.selectById(1);
const users = await userMapper.selectList();
const count = await userMapper.selectCount();

// 修改
await userMapper.updateById({ id: 1, age: 21 });

// 删除
await userMapper.deleteById(1);
await userMapper.deleteBatchIds([2, 3]);
```

### 4. Lambda 链式查询（核心亮点）

```ts
// 基本查询
const users = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .ge('age', 18)
  .like('email', '@gmail')
  .orderByDesc('id')
  .list();

// 分页查询
const page = await userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByAsc('age')
  .pageResult(1, 10);
// → { records: [...], total: 100, page: 1, size: 10, pages: 10 }

// 查询单条
const user = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .one();

// 查询数量
const count = await userMapper.lambdaQuery()
  .ge('age', 18)
  .count();
```

### 5. 动态条件

第一个参数传 `boolean`，为 `false` 时自动跳过该条件：

```ts
function searchUsers(name?: string, minAge?: number, email?: string) {
  return userMapper.lambdaQuery()
    .eq(name != null, 'userName', name)
    .ge(minAge != null, 'age', minAge)
    .like(email != null, 'email', email)
    .list();
}

// searchUsers('张三')        → WHERE user_name = '张三'
// searchUsers(null, 18)      → WHERE age >= 18
// searchUsers('张三', 18)    → WHERE user_name = '张三' AND age >= 18
// searchUsers()              → SELECT * (无条件)
```

### 6. OR 嵌套

```ts
const users = await userMapper.lambdaQuery()
  .ge('age', 18)
  .or(q => q.eq('userName', '张三').eq('userName', '李四'))
  .list();
// → WHERE age >= 18 AND (user_name = '张三' OR user_name = '李四')
```

### 7. Lambda 更新

```ts
await userMapper.lambdaUpdate()
  .set('age', 25)
  .set('email', 'new@test.com')
  .eq('userName', '张三')
  .execute();
// → UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE user_name = '张三'

// 动态 SET
await userMapper.lambdaUpdate()
  .set(newAge != null, 'age', newAge)       // null 时跳过
  .set(newEmail != null, 'email', newEmail) // null 时跳过
  .eq('id', 1)
  .execute();
```

### 8. 自定义 SQL

```ts
// #{param} 命名参数，自动转为预编译占位符，防 SQL 注入
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user WHERE age > #{age} AND user_name LIKE #{name}',
  { age: 18, name: '%张%' }
);
```

### 9. 插件机制

插件可以在 SQL 执行前后介入，实现日志、审计、慢查询监控、数据加解密等能力。

```ts
import type { Plugin, PluginContext } from 'node-mybatis-plus';

// 示例：SQL 日志插件
const sqlLogPlugin: Plugin = {
  name: 'sql-log',
  order: 0,  // 越小越先执行
  beforeExecute(ctx: PluginContext) {
    console.log(`[SQL] ${ctx.sql}`);
    console.log(`[Params] ${JSON.stringify(ctx.params)}`);
    (ctx as any)._startTime = Date.now();
  },
  afterExecute(ctx: PluginContext, result: any) {
    const cost = Date.now() - (ctx as any)._startTime;
    console.log(`[SQL] 耗时 ${cost}ms，影响行数: ${Array.isArray(result) ? result.length : '?'}`);
    return result;  // 返回 undefined 则保持原结果不变
  },
};

// 示例：慢查询告警插件
const slowQueryPlugin: Plugin = {
  name: 'slow-query',
  order: 10,
  beforeExecute(ctx: PluginContext) {
    (ctx as any)._start = Date.now();
  },
  afterExecute(ctx: PluginContext) {
    const cost = Date.now() - (ctx as any)._start;
    if (cost > 1000) {
      console.warn(`[慢查询] ${cost}ms → ${ctx.sql}`);
    }
  },
};

// 示例：SQL 改写插件（beforeExecute 中修改 ctx.sql / ctx.params）
const tenantPlugin: Plugin = {
  name: 'multi-tenant',
  order: -10,
  beforeExecute(ctx: PluginContext) {
    // 自动追加租户条件
    if (ctx.node.type === 'select' || ctx.node.type === 'update' || ctx.node.type === 'delete') {
      ctx.sql = ctx.sql.includes('WHERE')
        ? ctx.sql.replace('WHERE', 'WHERE tenant_id = ? AND')
        : ctx.sql + ' WHERE tenant_id = ?';
      ctx.params.push(getCurrentTenantId());
    }
  },
};
```

注册插件：

```ts
const ds = createDataSource({
  type: 'mysql',
  database: 'test',
  host: 'localhost',
  username: 'root',
  password: '******',
  plugins: [sqlLogPlugin, slowQueryPlugin],  // 传入插件数组
});
```

插件接口定义：

```ts
interface PluginContext {
  node: SqlNode;       // SQL AST 节点（select/insert/update/delete）
  sql: string;         // 编译后的 SQL 字符串（可在 beforeExecute 中修改）
  params: any[];       // 参数数组（可在 beforeExecute 中修改）
  entityMeta: EntityMeta;  // 实体元数据
}

interface Plugin {
  name: string;        // 插件名称
  order: number;       // 执行顺序，越小越先执行
  beforeExecute?(ctx: PluginContext): Promise<void> | void;   // SQL 执行前
  afterExecute?(ctx: PluginContext, result: any): Promise<any> | any;  // SQL 执行后
}
```

执行流程：`beforeExecute(按 order 升序) → 执行 SQL → afterExecute(按 order 升序)`

### 10. 事务

```ts
import { withTransaction, setDefaultDataSource, Transactional } from 'node-mybatis-plus';

setDefaultDataSource(ds);

// 方式一：编程式
await withTransaction(ds, async () => {
  await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
  await userMapper.lambdaUpdate().set('age', 21).eq('userName', '张三').execute();
  // 正常结束 → 自动 commit
  // 抛异常 → 自动 rollback
});

// 方式二：@Transactional 装饰器
class UserService {
  @Transactional()
  async transfer(from: string, to: string, amount: number) {
    await accountMapper.lambdaUpdate()
      .set('balance', fromBalance - amount)
      .eq('name', from).execute();
    await accountMapper.lambdaUpdate()
      .set('balance', toBalance + amount)
      .eq('name', to).execute();
    // 方法正常结束 → commit，抛异常 → rollback
  }
}
```

事务自动传播 — 嵌套的 `@Transactional` 方法复用外层事务连接：

```ts
class OrderService {
  @Transactional()
  async createOrder(userId: number, items: Item[]) {
    await orderMapper.insert(order);
    await this.updateStock(items);  // 复用同一个事务
  }

  @Transactional()
  async updateStock(items: Item[]) {
    // 单独调用 → 独立事务
    // 被 createOrder 调用 → 复用外层事务
  }
}
```

## 📖 API 参考

### 条件操作符

| 方法 | SQL | 示例 |
|------|-----|------|
| `eq` | `= ?` | `.eq('name', '张三')` |
| `ne` | `!= ?` | `.ne('status', 0)` |
| `gt` | `> ?` | `.gt('age', 18)` |
| `ge` | `>= ?` | `.ge('age', 18)` |
| `lt` | `< ?` | `.lt('age', 60)` |
| `le` | `<= ?` | `.le('age', 60)` |
| `like` | `LIKE '%x%'` | `.like('name', '张')` |
| `likeLeft` | `LIKE '%x'` | `.likeLeft('name', '三')` |
| `likeRight` | `LIKE 'x%'` | `.likeRight('name', '张')` |
| `between` | `BETWEEN ? AND ?` | `.between('age', 18, 30)` |
| `in` | `IN (?, ?)` | `.in('id', [1, 2, 3])` |
| `notIn` | `NOT IN (?, ?)` | `.notIn('id', [4, 5])` |
| `isNull` | `IS NULL` | `.isNull('email')` |
| `isNotNull` | `IS NOT NULL` | `.isNotNull('email')` |
| `or` | `OR (...)` | `.or(q => q.eq(...).eq(...))` |
| `and` | `AND (...)` | `.and(q => q.ge(...).le(...))` |

所有条件方法都支持动态条件重载：`.eq(condition, column, value)`

### BaseMapper 方法

| 方法 | 说明 |
|------|------|
| `insert(entity)` | 新增，返回自增 ID |
| `insertBatch(entities)` | 批量新增 |
| `saveBatch(entities, batchSize?)` | 分批插入（每批独立事务，默认 1000 条/批） |
| `deleteById(id)` | 按 ID 删除 |
| `deleteBatchIds(ids)` | 批量删除 |
| `delete(wrapper)` | 条件删除 |
| `updateById(entity)` | 按 ID 更新（null 字段不更新） |
| `update(entity, wrapper)` | 条件更新 |
| `selectById(id)` | 按 ID 查询 |
| `selectBatchIds(ids)` | 批量查询 |
| `selectOne(wrapper)` | 查询单条 |
| `selectList(wrapper?)` | 查询列表 |
| `selectCount(wrapper?)` | 查询数量 |
| `selectPage(page, size, wrapper?)` | 分页查询 |
| `rawQuery(sql, params?)` | 自定义 SQL |
| `lambdaQuery()` | 获取查询构造器 |
| `lambdaUpdate()` | 获取更新构造器 |

### 装饰器

| 装饰器 | 说明 | 示例 |
|--------|------|------|
| `@Table(name)` | 指定表名 | `@Table('sys_user')` |
| `@Id(options?)` | 主键，type: `auto`/`uuid`/`input` | `@Id({ type: 'auto' })` |
| `@Column(name?)` | 列映射，不传则自动 camelCase → snake_case | `@Column('user_name')` |
| `@Column({ exist: false })` | 标记非数据库字段 | 计算属性等 |
| `@Transactional()` | 声明式事务 | 方法装饰器 |

### 数据源配置

```ts
createDataSource({
  type: 'mysql',           // 'mysql' | 'postgres' | 'sqlite'
  host: 'localhost',       // 数据库地址
  port: 3306,              // 端口
  database: 'mydb',        // 数据库名（SQLite 为文件路径或 ':memory:'）
  username: 'root',        // 用户名
  password: '******',      // 密码
  pool: {                  // 连接池配置（可选）
    min: 2,
    max: 10,
    idleTimeout: 30000,
  },
  plugins: [],             // 插件数组（可选），详见「插件机制」章节
});
```

## 🏗️ 架构

```
用户代码 → Wrapper(条件收集) → SqlBuilder(AST构建) → Dialect(方言转换) → Plugin(插件链) → Executor(执行) → DataSource(连接池)
```

- **Wrapper 层**：收集查询/更新条件，生成 Condition 数组
- **SqlBuilder 层**：将条件转为 SQL AST，再编译为 SQL 字符串 + 参数数组
- **Dialect 层**：处理数据库差异（占位符 `?` vs `$1`、标识符引用、分页语法等）
- **Plugin 层**：按 order 排序执行 beforeExecute → SQL 执行 → afterExecute，支持 SQL 改写、日志、审计等
- **DataSource 层**：管理连接池，执行 SQL，支持事务

## 🧪 测试

```bash
# 运行全部测试（SQLite 内存库，无需外部数据库）
npm test

# 运行指定测试
npx vitest run test/wrapper.test.ts
```

测试覆盖：207 个用例，包括单元测试（方言、装饰器、SQL 构建、条件构造器）和集成测试（SQLite + MySQL 全 CRUD、事务、自定义 SQL）。

## 📋 Roadmap

### 核心功能

- [ ] JOIN 关联查询 — `lambdaQuery().leftJoin(Order).on(...)` 链式关联
- [ ] 逻辑删除 — `@LogicDelete` 装饰器，自动将 DELETE 转为 UPDATE
- [ ] 乐观锁 — `@Version` 装饰器，UPDATE 时自动检查版本号
- [ ] 自动填充 — `@TableField(fill: 'insert')` 创建时间/更新时间自动填充
- [ ] 枚举类型处理 — 自动转换 TypeScript 枚举与数据库值
- [ ] 结果集映射 — 查询结果自动 snake_case → camelCase 转换为实体实例

### 查询增强

- [ ] HAVING 条件构造 — `lambdaQuery().groupBy('dept').having(...)` 
- [ ] 子查询支持 — `inSql('id', 'SELECT user_id FROM orders')`
- [ ] EXISTS / NOT EXISTS 条件
- [ ] SELECT 聚合函数 — `selectSum('amount')` / `selectAvg('age')`
- [ ] DISTINCT 支持

### 数据库支持

- [ ] SQL Server 方言
- [ ] Oracle 方言
- [ ] 数据库迁移工具集成（或内置轻量迁移）

### 工程化

- [ ] 内置常用插件 — 分页拦截器、SQL 性能分析、数据权限
- [ ] 代码生成器 — 根据数据库表结构自动生成实体类和 Mapper
- [ ] ESM/CJS 双格式发布 ✅
- [ ] GitHub Actions CI/CD ✅
- [ ] 官方文档站点（VitePress）✅
- [ ] npm 发布 ✅

### 类型安全增强

- [ ] 查询结果类型推导 — `select('name', 'age')` 返回 `Pick<T, 'name' | 'age'>`
- [ ] 严格模式 — 编译期检测无效字段名（目前运行时检测）

## 🙏 致谢

- [MyBatis](https://mybatis.org/) — 优秀的 Java 持久层框架，本项目的 SQL 映射和命名参数设计深受其启发
- [MyBatis-Plus](https://baomidou.com/) — 本项目的 API 风格和核心理念（Lambda 链式查询、动态条件、通用 CRUD、BaseMapper）直接致敬 MyBatis-Plus，感谢苞米豆团队为 Java 生态做出的贡献

## 📄 License

MIT
