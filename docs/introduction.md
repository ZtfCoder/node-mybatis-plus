# node-mybatis-plus 项目介绍

## 这是什么

node-mybatis-plus 是一个面向 Node.js/TypeScript 的 ORM 库，API 设计完全对标 Java 生态中的 MyBatis-Plus。如果你是从 Java 转到 Node.js 的开发者，可以零学习成本上手。

## 为什么做这个

Node.js 生态中的 ORM 库（Prisma、TypeORM、Sequelize、Drizzle）各有特色，但没有一个提供 MyBatis-Plus 风格的开发体验：

| 痛点 | 现有方案 | node-mybatis-plus |
|------|----------|-------------------|
| 动态条件拼接 | 手动 if-else 拼 SQL 或 where 对象 | `.eq(name != null, 'userName', name)` 一行搞定 |
| 链式查询 | 部分支持，但 API 风格差异大 | 完全对标 MyBatis-Plus 的 lambdaQuery |
| 通用 CRUD | 需要定义 Repository 或写 SQL | BaseMapper 内置全套，继承即用 |
| 事务管理 | 手动传连接对象 | `@Transactional` 装饰器 + 自动传播 |
| 多数据库 | 各库语法不同 | 方言层统一抽象，一套代码切换 |

## 核心理念

1. **约定优于配置** — `@Column()` 不传参数自动 camelCase → snake_case，减少样板代码
2. **类型安全** — 泛型 `keyof T` 约束字段名，拼错字段编译期就报错
3. **渐进式** — 简单场景用 BaseMapper CRUD，复杂场景用 lambdaQuery 链式，极端场景用 rawQuery 原生 SQL
4. **零侵入** — 不生成代码、不修改原型链、不要求特定目录结构

## 适合谁

- Java 转 Node.js 的后端开发者
- 喜欢 MyBatis-Plus 风格 API 的团队
- 需要动态条件查询但不想手动拼 SQL 的项目
- 需要轻量 ORM 但不想引入 Prisma/TypeORM 全家桶的场景

## 技术栈

- TypeScript 5.x（装饰器 + 泛型）
- reflect-metadata（元数据存储）
- mysql2 / pg / better-sqlite3（数据库驱动，按需安装）
- AsyncLocalStorage（事务上下文传播）
- tsup（构建，同时输出 CJS/ESM）
- vitest（测试）

## 当前状态

已实现并通过 207 个测试用例：

- ✅ 装饰器：@Table / @Column / @Id
- ✅ BaseMapper 通用 CRUD（insert / delete / update / select 全家桶）
- ✅ Lambda 链式查询（16 种条件操作符 + 动态条件 + OR/AND 嵌套）
- ✅ Lambda 链式更新（动态 SET）
- ✅ 分页查询
- ✅ 自定义 SQL（#{param} 命名参数绑定）
- ✅ 多数据库方言（MySQL / PostgreSQL / SQLite）
- ✅ 事务管理（编程式 withTransaction + 声明式 @Transactional + 自动传播）
- ✅ SQL AST 中间层（Wrapper → AST → Dialect → SQL）
