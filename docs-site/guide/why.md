# 为什么选择 node-mybatis-plus

Node.js 生态中有多种成熟的数据库访问方案，各有不同的设计哲学和适用场景。本文从客观角度对比主流方案的特性差异，帮助你判断 node-mybatis-plus 是否适合你的项目。

## Node.js 数据库访问方案概览

当前 Node.js / TypeScript 生态中的主流数据库访问方案可以分为三类：

| 类别 | 代表库 | 核心理念 |
|------|--------|----------|
| Schema-First ORM | Prisma | 通过 `.prisma` 文件定义数据模型，生成类型安全的客户端 |
| Code-First ORM | TypeORM、MikroORM、Sequelize | 通过装饰器或代码定义实体，映射到数据库表 |
| SQL-First / 查询构建器 | Drizzle、Knex、Kysely | 贴近 SQL 语法，提供类型安全的查询构建 API |
| MyBatis 风格 ORM | node-mybatis-plus | 通用 CRUD + Lambda 链式条件构造器 + 动态 SQL |

## 功能特性对比

### 查询构建方式

| 特性 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|------|--------|---------|---------|------|-----------|-------------------|
| 查询 API 风格 | 对象式 `findMany({ where })` | QueryBuilder 链式 / Repository | SQL-like 链式 | SQL-like 链式 | 对象式 `findAll({ where })` | Lambda 链式 `.eq().ge().list()` |
| 动态条件拼接 | 手动构建 where 对象 | 手动 if-else 或 QueryBuilder | 手动组合条件 | 手动 if-else 链式 | 手动构建 where 对象 | 内置：`.eq(condition, col, val)` |
| 条件为空自动跳过 | ❌ 需手动处理 | ❌ 需手动处理 | ❌ 需手动处理 | ❌ 需手动处理 | ❌ 需手动处理 | ✅ 第一个参数传 `false` 自动跳过 |
| OR/AND 嵌套 | `OR: [...]` 数组嵌套 | `.orWhere()` / `.andWhere()` | `or()` / `and()` 函数 | `.orWhere()` / `.andWhere()` | `[Op.or]: [...]` | `.or(q => q.eq(...))` 回调嵌套 |
| 原生 SQL 支持 | `$queryRaw` | `query()` | `sql` 模板标签 | `.raw()` | `sequelize.query()` | `rawQuery('#{param}')` 命名参数 |

### 动态条件对比示例

以"可选参数搜索"为例，展示各库处理动态条件的代码差异：

**场景**：根据可选的 `name`、`minAge`、`email` 参数查询用户。

```ts
// node-mybatis-plus — 一行一个条件，false 自动跳过
const users = await userMapper.lambdaQuery()
  .eq(name != null, 'userName', name)
  .ge(minAge != null, 'age', minAge)
  .like(email != null, 'email', email)
  .list();
```

```ts
// Prisma — 需要手动构建 where 对象
const users = await prisma.user.findMany({
  where: {
    ...(name != null && { userName: name }),
    ...(minAge != null && { age: { gte: minAge } }),
    ...(email != null && { email: { contains: email } }),
  },
});
```

```ts
// TypeORM — QueryBuilder 需要 if-else
const qb = userRepo.createQueryBuilder('user');
if (name != null) qb.andWhere('user.userName = :name', { name });
if (minAge != null) qb.andWhere('user.age >= :minAge', { minAge });
if (email != null) qb.andWhere('user.email LIKE :email', { email: `%${email}%` });
const users = await qb.getMany();
```

```ts
// Drizzle — 需要手动组合条件数组
const conditions = [];
if (name != null) conditions.push(eq(users.userName, name));
if (minAge != null) conditions.push(gte(users.age, minAge));
if (email != null) conditions.push(like(users.email, `%${email}%`));
const result = await db.select().from(users).where(and(...conditions));
```

```ts
// Knex — 链式 if-else
let query = knex('sys_user');
if (name != null) query = query.where('user_name', name);
if (minAge != null) query = query.where('age', '>=', minAge);
if (email != null) query = query.where('email', 'like', `%${email}%`);
const users = await query;
```

### 类型安全

| 特性 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|------|--------|---------|---------|------|-----------|-------------------|
| 查询结果类型推导 | ✅ 自动推导 | ⚠️ 部分（Repository 模式） | ✅ 自动推导 | ❌ 需手动标注 | ❌ 需手动标注 | ⚠️ 泛型约束字段名 |
| 字段名编译期检查 | ✅ 生成的客户端 | ⚠️ 装饰器模式下 | ✅ Schema 定义 | ❌ 字符串 | ❌ 字符串 | ⚠️ `keyof T` 约束 |
| Schema 变更自动同步 | ✅ `prisma generate` | ⚠️ 手动同步 | ✅ Schema 即代码 | ❌ 手动 | ⚠️ `sync()` | ❌ 手动 |

### 数据库支持

| 数据库 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|--------|--------|---------|---------|------|-----------|-------------------|
| MySQL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SQLite | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SQL Server | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| MongoDB | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Oracle | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |

### 事务管理

| 特性 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|------|--------|---------|---------|------|-----------|-------------------|
| 编程式事务 | `$transaction()` | `queryRunner` | `db.transaction()` | `knex.transaction()` | `sequelize.transaction()` | `withTransaction()` |
| 声明式事务（装饰器） | ❌ | ❌（需第三方） | ❌ | ❌ | ❌ | ✅ `@Transactional` |
| 自动传播（嵌套复用） | ❌ 需手动传递 | ❌ 需手动传递 | ❌ 需手动传递 | ❌ 需手动传递 | ❌ 需手动传递 | ✅ AsyncLocalStorage 自动传播 |

### 插件 / 中间件机制

| 特性 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|------|--------|---------|---------|------|-----------|-------------------|
| 中间件/插件 | ✅ `$use` 中间件 | ✅ Subscriber / Listener | ❌ 无内置 | ❌ 无内置 | ✅ Hooks | ✅ Plugin（beforeExecute/afterExecute） |
| SQL 改写能力 | ⚠️ 有限 | ❌ | ❌ | ❌ | ❌ | ✅ 可修改 ctx.sql/ctx.params |
| 执行顺序控制 | ❌ | ❌ | — | — | ❌ | ✅ order 字段排序 |

### 迁移 / Schema 管理

| 特性 | Prisma | TypeORM | Drizzle | Knex | Sequelize | node-mybatis-plus |
|------|--------|---------|---------|------|-----------|-------------------|
| 内置迁移工具 | ✅ `prisma migrate` | ✅ 内置 | ✅ `drizzle-kit` | ✅ 内置 | ✅ 内置 | ❌ 无内置 |
| 自动生成迁移 | ✅ | ⚠️ 部分 | ✅ | ❌ 手动编写 | ❌ 手动编写 | ❌ |
| Schema 可视化 | ✅ Prisma Studio | ❌ | ✅ Drizzle Studio | ❌ | ❌ | ❌ |

### 包体积与运行时依赖

| 库 | 核心依赖 | 是否需要代码生成 | 运行时引擎 |
|----|----------|------------------|------------|
| Prisma | `@prisma/client` + Prisma Engine | ✅ `prisma generate` | Rust 引擎（Query Engine） |
| TypeORM | `typeorm` + `reflect-metadata` | ❌ | 纯 JS |
| Drizzle | `drizzle-orm` | ❌ | 纯 JS |
| Knex | `knex` | ❌ | 纯 JS |
| Sequelize | `sequelize` | ❌ | 纯 JS |
| node-mybatis-plus | `node-mybatis-plus` + `reflect-metadata` | ❌ | 纯 JS |

## 各库适用场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 快速原型 / 全栈项目 | Prisma | Schema 文件即文档，自动迁移，Prisma Studio 可视化 |
| Serverless / Edge 部署 | Drizzle | 零依赖，包体积小，无代码生成步骤 |
| 企业级 Java 风格后端 | TypeORM / node-mybatis-plus | 装饰器实体映射，Repository / Mapper 模式 |
| 需要精细 SQL 控制 | Knex / Drizzle | SQL-first 设计，贴近原生 SQL |
| 大量动态条件查询 | node-mybatis-plus | 内置动态条件跳过，无需 if-else |
| 需要声明式事务 | node-mybatis-plus | 唯一内置 `@Transactional` + 自动传播的方案 |
| 熟悉 MyBatis-Plus 的团队 | node-mybatis-plus | API 风格一致，零学习成本迁移 |
| 需要 MongoDB 支持 | Prisma / TypeORM | node-mybatis-plus 仅支持关系型数据库 |
| 需要完善的迁移工具 | Prisma / Drizzle | node-mybatis-plus 不包含迁移工具 |

## node-mybatis-plus 的定位

node-mybatis-plus 不试图替代上述任何一个库。它填补的是 Node.js 生态中的一个特定空白：

**MyBatis-Plus 风格的开发体验**

- 如果你的团队从 Java 转向 Node.js，熟悉 `lambdaQuery().eq().ge().list()` 这套 API
- 如果你的业务有大量可选参数的动态查询，不想写 if-else 拼条件
- 如果你需要声明式事务 `@Transactional` 和自动传播，而不是手动传递事务对象
- 如果你需要插件机制在 SQL 执行前后介入（日志、审计、多租户 SQL 改写）

那么 node-mybatis-plus 可能是一个合适的选择。

**已知局限**

以下是 node-mybatis-plus 目前不具备的能力，选型时需要考虑：

- 不包含数据库迁移工具（需要配合 Knex migrations 或手动管理）
- 不支持 MongoDB、SQL Server、Oracle 等数据库
- 不支持关联查询（JOIN）的链式构建，复杂关联需要使用 `rawQuery`
- 查询结果的类型推导不如 Prisma / Drizzle 完善
- 社区规模和生态成熟度不如 Prisma、TypeORM 等老牌方案
- 不支持 Schema 可视化工具

## 总结

没有"最好"的 ORM，只有最适合当前项目和团队的方案。以下是一个简化的决策参考：

```
你需要什么？
│
├── Schema 驱动 + 自动迁移 + 可视化 → Prisma
├── Serverless / Edge + 极小包体积 → Drizzle
├── 传统 ORM + 装饰器实体 + 丰富生态 → TypeORM
├── 纯 SQL 控制 + 轻量查询构建 → Knex / Kysely
├── MyBatis-Plus 风格 + 动态条件 + 声明式事务 → node-mybatis-plus
└── 遗留项目 + 成熟稳定 → Sequelize
```
