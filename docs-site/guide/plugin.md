# 插件机制

node-mybatis-plus 提供插件机制，可以在 SQL 执行前后介入，实现日志记录、慢查询告警、SQL 改写、数据审计等能力。插件通过 `DataSourceConfig.plugins` 数组注册，按 `order` 字段排序执行。

## Plugin 接口定义

```ts
interface Plugin {
  name: string;        // 插件名称
  order: number;       // 执行顺序，数值越小越先执行
  beforeExecute?(ctx: PluginContext): Promise<void> | void;
  afterExecute?(ctx: PluginContext, result: any): Promise<any> | any;
}
```

## PluginContext 接口

每次 SQL 执行时，框架会创建一个 `PluginContext` 对象，贯穿整个插件链：

```ts
interface PluginContext {
  node: SqlNode;         // SQL AST 节点（select / insert / update / delete）
  sql: string;           // 编译后的 SQL 字符串（可在 beforeExecute 中修改）
  params: any[];         // 参数数组（可在 beforeExecute 中修改）
  entityMeta: EntityMeta; // 当前操作的实体元数据
}
```

::: tip
`beforeExecute` 中可以直接修改 `ctx.sql` 和 `ctx.params`，修改后的值会传递给后续插件和最终的 SQL 执行。
:::

## 执行流程

插件的执行流程如下：

```
beforeExecute（按 order 升序依次执行）
       ↓
    执行 SQL
       ↓
afterExecute（按 order 升序依次执行）
```

1. 框架将所有插件按 `order` 升序排列
2. 依次调用每个插件的 `beforeExecute`（如果定义了）
3. 使用可能被插件修改过的 `ctx.sql` 和 `ctx.params` 执行 SQL
4. 依次调用每个插件的 `afterExecute`（如果定义了），传入执行结果
5. 如果 `afterExecute` 返回非 `undefined` 值，则替换结果传递给下一个插件

## SQL 日志插件示例

记录每条 SQL 的执行语句、参数和耗时：

```ts
import type { Plugin, PluginContext } from 'node-mybatis-plus';

const sqlLogPlugin: Plugin = {
  name: 'sql-log',
  order: 0,
  beforeExecute(ctx: PluginContext) {
    console.log(`[SQL] ${ctx.sql}`);
    console.log(`[Params] ${JSON.stringify(ctx.params)}`);
    (ctx as any)._startTime = Date.now();
  },
  afterExecute(ctx: PluginContext, result: any) {
    const cost = Date.now() - (ctx as any)._startTime;
    const rows = Array.isArray(result) ? result.length : '?';
    console.log(`[SQL] 耗时 ${cost}ms，影响行数: ${rows}`);
    return result;
  },
};
```

输出示例：

```
[SQL] SELECT `id`, `user_name`, `age`, `email` FROM `sys_user` WHERE `age` >= ?
[Params] [18]
[SQL] 耗时 3ms，影响行数: 42
```

## 慢查询告警插件示例

当 SQL 执行时间超过阈值时输出告警：

```ts
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
```

::: warning
慢查询阈值（示例中为 1000ms）应根据实际业务场景调整。生产环境建议接入监控系统而非仅打印日志。
:::

## 多租户 SQL 改写

框架已内置多租户插件，推荐直接使用 `createMultiTenantPlugin`，无需手写 SQL 改写逻辑：

```ts
import { createMultiTenantPlugin } from 'node-mybatis-plus';

const ds = createDataSource({
  plugins: [
    createMultiTenantPlugin({
      getTenantId: () => getCurrentTenantId(),
      ignoreTables: ['sys_config'],
    }),
  ],
});
```

详见 [多租户指南](/guide/multi-tenant)。

::: tip
如果你需要实现自定义的 SQL 改写逻辑，可以在 `beforeExecute` 中操作 `ctx.sql` 和 `ctx.params`。建议使用 `ctx.node` 的 AST 信息判断 SQL 类型，而不是直接字符串匹配，以避免边界情况。
:::

## 注册插件

通过 `DataSourceConfig.plugins` 数组注册插件：

```ts
import { createDataSource } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '******',
  plugins: [sqlLogPlugin, slowQueryPlugin],
});
```

插件会按 `order` 字段升序排列后执行。上面的例子中，执行顺序为：

| 插件 | order | 执行顺序 |
|------|-------|----------|
| `sql-log` | 0 | 第 1 个 |
| `slow-query` | 10 | 第 2 个 |

## 插件开发建议

- `order` 值越小越先执行，SQL 改写类插件建议使用负数 order
- `beforeExecute` 和 `afterExecute` 都是可选的，按需实现
- `afterExecute` 返回 `undefined` 时保持原结果不变，返回其他值则替换结果
- 插件支持 `async` 函数，可以在钩子中执行异步操作
- 通过 `ctx.node.type` 判断 SQL 类型（`select` / `insert` / `update` / `delete`），按需处理

## 下一步

- [逻辑删除](/guide/logic-delete) — 内置逻辑删除插件
- [自动填充](/guide/auto-fill) — 内置自动填充插件
- [多租户](/guide/multi-tenant) — 内置多租户插件
- [多数据库切换](/guide/multi-database) — 一套代码切换 MySQL / PostgreSQL / SQLite
