# Implementation Plan: node-mybatis-plus 官方文档站点

## 概述

基于 VitePress 为 node-mybatis-plus 构建官方文档站点。按照"项目初始化 → 首页 → 指南分区 → API 参考分区 → 设计文档分区 → 搜索与中文配置 → 构建验证"的顺序逐步实现，每个阶段产出可构建的增量成果。

## Tasks

- [x] 1. VitePress 项目初始化与基础配置
  - [x] 1.1 初始化 docs-site 子项目
    - 创建 `docs-site/` 目录，初始化 `package.json`，安装 `vitepress` 依赖
    - 创建 `docs-site/.vitepress/config.mts` 基础配置文件，设置 `lang: 'zh-CN'`、`title`、`description`
    - 配置 `themeConfig.search` 为 `{ provider: 'local' }` 并添加中文翻译
    - 配置 `themeConfig.socialLinks` 添加 GitHub 链接
    - 在 `docs-site/package.json` 中添加 `dev` 和 `build` 脚本
    - _Requirements: 1.1, 1.2, 1.3, 8.1, 9.3_

  - [x] 1.2 在根项目 package.json 中添加文档代理脚本
    - 添加 `docs:dev` 脚本：`cd docs-site && npx vitepress dev`
    - 添加 `docs:build` 脚本：`cd docs-site && npx vitepress build`
    - _Requirements: 1.4_

  - [x] 1.3 配置导航栏和多侧边栏
    - 在 `config.mts` 中配置 `themeConfig.nav`：指南、API 参考、设计文档、GitHub
    - 配置 `themeConfig.sidebar`：按 `/guide/`、`/api/`、`/design/` 路径前缀分别定义侧边栏
    - 指南侧边栏分为"基础"、"核心功能"、"高级功能"三组
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. 首页实现
  - [x] 2.1 创建首页 index.md
    - 创建 `docs-site/index.md`，使用 `layout: home` frontmatter
    - 配置 Hero 区域：项目名称、一句话描述、"快速开始"和"GitHub"两个行动按钮
    - 配置 Features 区域：6 个核心特性卡片（Lambda 链式查询、动态 SQL、多数据库支持、通用 CRUD、声明式事务、插件机制）
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Checkpoint - 验证基础结构
  - 运行 `cd docs-site && npx vitepress build` 确保构建成功
  - 确认 `docs-site/.vitepress/dist/index.html` 已生成
  - 如有问题请询问用户

- [x] 4. 使用指南分区 — 基础篇
  - [x] 4.1 创建项目介绍页面 guide/introduction.md
    - 内容包括：项目定位、核心理念、适合谁、技术栈、当前状态
    - 参考现有 `docs/introduction.md` 内容进行重新组织
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 创建快速开始页面 guide/getting-started.md
    - 内容包括：安装命令、数据库驱动安装、定义实体、创建数据源和 Mapper、基本 CRUD 示例
    - 提供完整可运行的 TypeScript 代码示例
    - _Requirements: 4.1, 4.2_

  - [x] 4.3 创建实体定义页面 guide/entity-definition.md
    - 内容包括：@Table、@Column、@Id 装饰器用法、camelCase → snake_case 自动转换、非数据库字段标记
    - _Requirements: 4.1, 4.2_

  - [x] 4.4 创建数据源配置页面 guide/datasource.md
    - 内容包括：MySQL/PostgreSQL/SQLite 配置示例、连接池配置、关闭数据源
    - _Requirements: 4.1, 4.2_

- [x] 5. 使用指南分区 — 核心功能篇
  - [x] 5.1 创建 BaseMapper CRUD 页面 guide/base-mapper.md
    - 内容包括：创建 Mapper、新增（单条/批量）、查询（ID/批量/列表/单条/数量/分页）、修改、删除
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 创建 Lambda 链式查询页面 guide/lambda-query.md
    - 内容包括：基本用法、全部条件方法、终结方法（list/one/count/pageResult）、select 指定列
    - _Requirements: 4.1, 4.2_

  - [x] 5.3 创建动态条件页面 guide/dynamic-condition.md
    - 内容包括：动态条件原理、查询动态条件、更新动态条件、OR/AND 嵌套
    - _Requirements: 4.1, 4.2_

  - [x] 5.4 创建 Lambda 更新页面 guide/lambda-update.md
    - 内容包括：基本用法、动态 SET、execute 返回值
    - _Requirements: 4.1, 4.2_

  - [x] 5.5 创建分页查询页面 guide/pagination.md
    - 内容包括：lambdaQuery 链式分页、BaseMapper 分页方法、Page 返回结构
    - _Requirements: 4.1, 4.2_

  - [x] 5.6 创建自定义 SQL 页面 guide/custom-sql.md
    - 内容包括：#{param} 命名参数、防 SQL 注入、无参数查询
    - _Requirements: 4.1, 4.2_

- [x] 6. 使用指南分区 — 高级功能篇
  - [x] 6.1 创建事务管理页面 guide/transaction.md
    - 内容包括：编程式事务 withTransaction、@Transactional 装饰器、事务传播机制
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 创建插件机制页面 guide/plugin.md
    - 内容包括：插件接口定义、beforeExecute/afterExecute 钩子、SQL 日志插件示例、慢查询插件示例、注册插件
    - _Requirements: 4.1, 4.2_

  - [x] 6.3 创建多数据库切换页面 guide/multi-database.md
    - 内容包括：切换数据库类型、方言层自动处理的差异对比表
    - _Requirements: 4.1, 4.2_

- [x] 7. Checkpoint - 验证指南分区
  - 运行构建确保所有指南页面无死链接
  - 确认侧边栏导航正确展示 13 个指南页面
  - 如有问题请询问用户

- [x] 8. API 参考分区
  - [x] 8.1 创建装饰器 API 页面 api/decorators.md
    - 内容包括：@Table、@Column、@Id、@Transactional 的方法签名、参数说明、返回值类型和使用示例
    - _Requirements: 5.1, 5.2_

  - [x] 8.2 创建 BaseMapper 方法列表页面 api/base-mapper.md
    - 使用表格展示所有方法签名、参数、返回值
    - _Requirements: 5.1, 5.2_

  - [x] 8.3 创建 LambdaQueryWrapper 方法页面 api/query-wrapper.md
    - 使用表格展示条件操作符的方法名、对应 SQL 和使用示例
    - 列出终结方法（list/one/count/pageResult）
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.4 创建 LambdaUpdateWrapper 方法页面 api/update-wrapper.md
    - 内容包括：set 方法、条件方法、execute 终结方法
    - _Requirements: 5.1, 5.2_

  - [x] 8.5 创建数据源配置选项页面 api/datasource.md
    - 使用表格展示 DataSourceConfig 所有配置项、类型、默认值和说明
    - _Requirements: 5.1, 5.2_

  - [x] 8.6 创建插件接口定义页面 api/plugin.md
    - 内容包括：Plugin 接口、PluginContext 接口的 TypeScript 类型定义和字段说明
    - _Requirements: 5.1, 5.2_

  - [x] 8.7 创建类型定义页面 api/types.md
    - 内容包括：Page、EntityMeta、ColumnMeta、SqlNode、Condition、ConditionGroup 等类型定义
    - _Requirements: 5.1, 5.2_

- [x] 9. 设计文档分区
  - [x] 9.1 创建架构概览页面 design/architecture.md
    - 内容包括：分层架构图（文本形式）、数据流说明、各层职责
    - _Requirements: 6.1, 6.2_

  - [x] 9.2 创建 SQL AST 设计页面 design/sql-ast.md
    - 内容包括：AST 节点定义（TypeScript 接口）、Wrapper → AST 转换流程、参数绑定机制
    - _Requirements: 6.1, 6.3_

  - [x] 9.3 创建方言系统页面 design/dialect.md
    - 内容包括：Dialect 接口定义、各数据库差异对比表、方言自动选择机制
    - _Requirements: 6.1, 6.3_

  - [x] 9.4 创建事务实现页面 design/transaction.md
    - 内容包括：AsyncLocalStorage 传播机制、事务生命周期、嵌套事务 Savepoint
    - _Requirements: 6.1, 6.3_

  - [x] 9.5 创建插件系统设计页面 design/plugin-system.md
    - 内容包括：插件接口、执行流程（beforeExecute → SQL → afterExecute）、插件注册和排序
    - _Requirements: 6.1, 6.3_

- [x] 10. Checkpoint - 验证 API 和设计文档分区
  - 运行构建确保所有页面无死链接
  - 确认 API 参考 7 个页面和设计文档 5 个页面全部存在
  - 如有问题请询问用户

- [x] 11. 最终集成与构建验证
  - [x] 11.1 完整构建验证
    - 运行 `cd docs-site && npx vitepress build` 确保构建成功（退出码 0）
    - 确认 `.vitepress/dist/` 目录包含 `index.html`
    - 确认无死链接警告
    - _Requirements: 1.3, 7.1, 7.2, 7.3_

  - [x] 11.2 内容完整性检查
    - 验证首页 `index.md` 包含 Hero 和 Features 配置
    - 验证指南分区 13 个页面全部存在
    - 验证 API 参考分区 7 个页面全部存在
    - 验证设计文档分区 5 个页面全部存在
    - _Requirements: 4.1, 5.1, 6.1_

- [x] 12. Final checkpoint - 确保构建通过
  - 确保所有构建通过，如有问题请询问用户

## Notes

- 本项目为纯静态文档站点，不涉及属性基测试（PBT），测试以构建验证和内容完整性检查为主
- 每个任务引用了具体的需求编号以确保可追溯性
- Checkpoint 任务用于阶段性验证，确保增量交付质量
- 代码语法高亮和复制按钮为 VitePress 默认主题内置功能，无需额外实现（需求 7）
- 响应式布局为 VitePress 默认主题内置行为，无需额外实现（需求 9.1, 9.2）
