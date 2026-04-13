# 项目介绍

## 这是什么

node-mybatis-plus 是一个 **MyBatis-Plus 风格的 Node.js ORM 库**，为 TypeScript 开发者提供类型安全的链式查询、动态 SQL 和通用 CRUD 能力。

> 如果你用过 Java 的 MyBatis-Plus，那你已经会用了。

## 核心理念

- **类型安全** — 泛型 `keyof T` 约束字段名，拼错字段编译期就报错
- **链式查询** — 完全对标 MyBatis-Plus 的 `lambdaQuery` / `lambdaUpdate`，链式调用构建复杂查询
- **动态 SQL** — 条件为 `false` 时自动跳过，告别 if-else 拼 SQL
- **约定优于配置** — `@Column()` 不传参数自动 camelCase → snake_case，减少样板代码
- **渐进式** — 简单场景用 BaseMapper CRUD，复杂场景用 lambdaQuery 链式，极端场景用 rawQuery 原生 SQL

## 为什么选择 node-mybatis-plus

Node.js 生态中的 ORM 库（Prisma、TypeORM、Sequelize、Drizzle）各有特色，但没有一个提供 MyBatis-Plus 风格的开发体验：

| 痛点 | 现有方案 | node-mybatis-plus |
|------|----------|-------------------|
| 动态条件拼接 | 手动 if-else 拼 SQL 或 where 对象 | `.eq(name != null, 'userName', name)` 一行搞定 |
| 链式查询 | 部分支持，但 API 风格差异大 | 完全对标 MyBatis-Plus 的 lambdaQuery |
| 通用 CRUD | 需要定义 Repository 或写 SQL | BaseMapper 内置全套，继承即用 |
| 事务管理 | 手动传连接对象 | `@Transactional` 装饰器 + 自动传播 |
| 多数据库 | 各库语法不同 | 方言层统一抽象，一套代码切换 |

## 适合谁

- **Java 转 Node.js 的后端开发者** — 熟悉 MyBatis-Plus 的 API 风格，零学习成本上手
- **TypeScript 开发者需要 ORM** — 喜欢类型安全和链式调用的开发体验
- **需要动态条件查询的项目** — 不想手动拼 SQL，又不想引入重量级 ORM
- **喜欢 MyBatis-Plus 风格 API 的团队** — 统一前后端技术栈的 ORM 风格

## 技术栈

- **TypeScript 5.x** — 装饰器 + 泛型，提供完整的类型推导
- **reflect-metadata** — 运行时元数据存储，支撑装饰器映射机制
- **数据库驱动** — mysql2 / pg / better-sqlite3，按需安装
- **AsyncLocalStorage** — Node.js 内置 API，实现事务上下文自动传播
- **tsup** — 构建工具，同时输出 CJS/ESM 双格式

## 当前状态

已实现并通过 207 个测试用例，支持以下功能：

- ✅ **装饰器映射** — `@Table` / `@Column` / `@Id`，自动 camelCase → snake_case
- ✅ **通用 CRUD** — BaseMapper 内置 insert / delete / update / select 全家桶
- ✅ **Lambda 链式查询** — 16 种条件操作符 + 动态条件 + OR/AND 嵌套
- ✅ **Lambda 链式更新** — 动态 SET，条件更新
- ✅ **分页查询** — 自动计算总页数，返回 `Page<T>` 结构
- ✅ **自定义 SQL** — `#{param}` 命名参数绑定，防 SQL 注入
- ✅ **多数据库支持** — MySQL / PostgreSQL / SQLite，方言层自动处理差异
- ✅ **事务管理** — 编程式 `withTransaction` + 声明式 `@Transactional` + 自动传播
- ✅ **插件机制** — beforeExecute / afterExecute 钩子，支持日志、审计、SQL 改写
