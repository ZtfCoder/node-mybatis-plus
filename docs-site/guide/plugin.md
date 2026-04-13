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

## 多租户 SQL 改写插件示例

在 `beforeExecute` 中修改 `ctx.sql` 和 `ctx.params`，自动为查询、更新、删除语句追加租户条件：

```ts
function getCurrentTenantId(): number {
  // 从请求上下文中获取当前租户 ID
  return 1;
}

const tenantPlugin: Plugin = {
  name: 'multi-tenant',
  order: -10, // 负数 order，确保在其他插件之前执行
  beforeExecute(ctx: PluginContext) {
    const { type } = ctx.node;
    if (type === 'select' || type === 'update' || type === 'delete') {
      // 修改 SQL：追加租户条件
      if (ctx.sql.includes('WHERE')) {
        ctx.sql = ctx.sql.replace('WHERE', 'WHERE tenant_id = ? AND');
      } else {
        ctx.sql = ctx.sql + ' WHERE tenant_id = ?';
      }
      // 修改参数：追加租户 ID
      ctx.params.push(getCurrentTenantId());
    }
  },
};
```

改写前后对比：

```sql
-- 原始 SQL
SELECT `id`, `user_name` FROM `sys_user` WHERE `age` >= ?
-- 参数: [18]

-- 改写后
SELECT `id`, `user_name` FROM `sys_user` WHERE tenant_id = ? AND `age` >= ?
-- 参数: [18, 1]
```

::: tip
`beforeExecute` 中对 `ctx.sql` 和 `ctx.params` 的修改会直接影响最终执行的 SQL。利用这一点可以实现 SQL 改写、参数注入等高级功能。
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
  plugins: [sqlLogPlugin, slowQueryPlugin, tenantPlugin],
});
```

插件会按 `order` 字段升序排列后执行。上面的例子中，执行顺序为：

| 插件 | order | 执行顺序 |
|------|-------|----------|
| `multi-tenant` | -10 | 第 1 个 |
| `sql-log` | 0 | 第 2 个 |
| `slow-query` | 10 | 第 3 个 |

## 插件开发建议

- `order` 值越小越先执行，SQL 改写类插件建议使用负数 order
- `beforeExecute` 和 `afterExecute` 都是可选的，按需实现
- `afterExecute` 返回 `undefined` 时保持原结果不变，返回其他值则替换结果
- 插件支持 `async` 函数，可以在钩子中执行异步操作
- 通过 `ctx.node.type` 判断 SQL 类型（`select` / `insert` / `update` / `delete`），按需处理

## 下一步

- [多数据库切换](/guide/multi-database) — 一套代码切换 MySQL / PostgreSQL / SQLite
- [事务管理](/guide/transaction) — 编程式事务和声明式事务
