# 插件系统设计

node-mybatis-plus 的插件系统允许开发者在 SQL 执行前后插入自定义逻辑，实现日志记录、SQL 改写、审计等功能。插件通过简单的接口定义和注册机制集成到框架中。

## 插件接口设计

### Plugin 接口

```ts
interface Plugin {
  /** 插件名称，用于标识和调试 */
  name: string;

  /** 执行顺序，数值越小越先执行 */
  order: number;

  /**
   * SQL 执行前钩子
   * 可以修改 ctx 中的 sql、params、node
   */
  beforeExecute?(ctx: PluginContext): Promise<void> | void;

  /**
   * SQL 执行后钩子
   * 可以处理或替换返回结果
   */
  afterExecute?(ctx: PluginContext, result: any): Promise<any> | any;
}
```

`beforeExecute` 和 `afterExecute` 都是可选的。插件可以只实现其中一个，也可以两个都实现。

### PluginContext 接口

```ts
interface PluginContext {
  /** SQL AST 节点 */
  node: SqlNode;

  /** 编译后的 SQL 字符串 */
  sql: string;

  /** SQL 参数数组 */
  params: any[];

  /** 实体元数据 */
  entityMeta: EntityMeta;
}
```

`PluginContext` 是插件与框架之间的数据桥梁。`beforeExecute` 中对 `ctx` 的修改会影响后续的 SQL 执行。

## 执行流程

插件的执行遵循以下流程：

```
排序 → beforeExecute 链 → SQL 执行 → afterExecute 链
```

详细流程：

```
1. 按 order 字段对插件数组排序（升序）
2. 依次执行每个插件的 beforeExecute(ctx)
   ├── plugin1.beforeExecute(ctx)  // order: 1
   ├── plugin2.beforeExecute(ctx)  // order: 5
   └── plugin3.beforeExecute(ctx)  // order: 10
3. 使用 ctx.sql 和 ctx.params 执行 SQL
4. 依次执行每个插件的 afterExecute(ctx, result)
   ├── plugin1.afterExecute(ctx, result)
   ├── plugin2.afterExecute(ctx, result)
   └── plugin3.afterExecute(ctx, result)
5. 返回最终结果
```

## runPlugins 函数实现原理

`runPlugins` 是插件执行器的核心函数：

```ts
async function runPlugins(
  ds: DataSource,
  node: SqlNode,
  sql: string,
  params: any[],
  entityMeta: EntityMeta,
): Promise<any> {
  // 1. 按 order 排序
  const plugins = [...ds.plugins].sort((a, b) => a.order - b.order);

  // 2. 构建上下文
  const ctx: PluginContext = { node, sql, params, entityMeta };

  // 3. 执行 beforeExecute 链
  for (const p of plugins) {
    if (p.beforeExecute) {
      await p.beforeExecute(ctx);
    }
  }

  // 4. 执行 SQL（使用可能被插件修改过的 sql/params）
  let result = await ds.execute(ctx.sql, ctx.params);

  // 5. 执行 afterExecute 链
  for (const p of plugins) {
    if (p.afterExecute) {
      const r = await p.afterExecute(ctx, result);
      if (r !== undefined) result = r;  // 插件可以替换结果
    }
  }

  return result;
}
```

关键实现细节：

| 细节 | 说明 |
|------|------|
| `[...ds.plugins].sort()` | 复制数组后排序，避免修改原始插件列表 |
| `await p.beforeExecute(ctx)` | 支持同步和异步钩子（`Promise<void> \| void`） |
| `ds.execute(ctx.sql, ctx.params)` | 使用 `ctx` 中的值，而非原始参数，因为插件可能已修改 |
| `if (r !== undefined) result = r` | `afterExecute` 返回非 `undefined` 值时替换结果 |

### 调用时机

`runPlugins` 在 Wrapper 的终结方法中被调用。以 `LambdaQueryWrapper.list()` 为例：

```ts
async list(): Promise<T[]> {
  const ds = this.requireDs();
  const node = this.buildSelectNode();
  const builder = new SqlBuilder(ds.dialect);
  const { sql, params } = builder.build(node);

  // 有插件时走插件链，否则直接执行
  if (ds.plugins.length) {
    return runPlugins(ds, node, sql, params, this.entityMeta);
  }
  return ds.execute(sql, params);
}
```

当 DataSource 没有注册插件时，跳过插件链直接执行 SQL，避免不必要的开销。

## 插件注册机制

插件通过 `DataSourceConfig.plugins` 数组注册：

```ts
const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  database: 'test',
  username: 'root',
  password: '***',
  plugins: [
    sqlLogPlugin,
    slowQueryPlugin,
  ],
});
```

DataSource 实现在构造函数中将插件数组存储到 `plugins` 属性：

```ts
class MysqlDataSource implements DataSource {
  plugins: Plugin[];

  constructor(config: DataSourceConfig) {
    this.plugins = config.plugins ?? [];
    // ...
  }
}
```

`DataSourceConfig.plugins` → `DataSource.plugins` 的传递是直接引用。插件实例在 DataSource 的整个生命周期内保持不变。

## 设计决策

### 为什么用 order 排序

插件之间可能存在依赖关系。例如：

- SQL 日志插件（order: 100）需要在其他插件修改 SQL 之后执行，才能记录最终的 SQL
- 审计插件（order: 1）需要在最早的时机捕获原始 SQL

通过 `order` 字段，开发者可以精确控制插件的执行顺序：

```ts
const auditPlugin: Plugin = {
  name: 'audit',
  order: 1,        // 最先执行
  beforeExecute(ctx) { /* 记录原始 SQL */ }
};

const logPlugin: Plugin = {
  name: 'sql-log',
  order: 100,      // 最后执行
  beforeExecute(ctx) { /* 记录最终 SQL */ }
};
```

`order` 值越小，执行优先级越高。相同 `order` 值的插件按注册顺序执行。

### 为什么 beforeExecute 可以修改 ctx

`beforeExecute` 接收的 `PluginContext` 是一个可变对象，插件可以直接修改其中的 `sql`、`params` 和 `node` 字段。这个设计决策基于以下考虑：

**实际需求驱动**：许多插件场景需要修改 SQL：

```ts
// SQL 改写示例：软删除插件将 DELETE 转为 UPDATE
const softDeletePlugin: Plugin = {
  name: 'soft-delete',
  order: 5,
  beforeExecute(ctx) {
    if (ctx.node.type === 'delete') {
      // 将 DELETE FROM table WHERE ... 改写为
      // UPDATE table SET deleted = 1 WHERE ...
      ctx.sql = ctx.sql.replace(/^DELETE FROM/, 'UPDATE');
      ctx.sql += ' SET deleted = 1';
    }
  }
};
```

```ts
// SQL 日志插件：只读取 ctx，不修改
const sqlLogPlugin: Plugin = {
  name: 'sql-log',
  order: 100,
  beforeExecute(ctx) {
    console.log(`[SQL] ${ctx.sql}`);
    console.log(`[Params] ${JSON.stringify(ctx.params)}`);
  }
};
```

**简单直接**：相比返回新对象或使用不可变数据结构，直接修改 `ctx` 更简单，减少了样板代码。插件开发者只需关注业务逻辑。

**链式传递**：多个插件按顺序执行时，前一个插件的修改自动对后续插件可见，形成自然的处理管道。

:::tip 插件开发建议
- 只读插件（如日志）建议使用较大的 `order` 值（如 100），确保读取到最终的 SQL
- 修改型插件（如软删除）建议使用较小的 `order` 值（如 1-10），在其他插件之前完成改写
- `afterExecute` 返回 `undefined` 表示不修改结果，返回其他值则替换结果
:::
