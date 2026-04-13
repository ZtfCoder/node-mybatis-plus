# 插件接口

node-mybatis-plus 提供插件机制，允许在 SQL 执行前后插入自定义逻辑，如日志记录、SQL 审计、慢查询检测等。

## Plugin

插件接口定义。

```ts
interface Plugin {
  name: string
  order: number
  beforeExecute?(ctx: PluginContext): Promise<void> | void
  afterExecute?(ctx: PluginContext, result: any): Promise<any> | any
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 插件名称，用于标识和调试 |
| `order` | `number` | 是 | 执行顺序，数值越小越先执行 |
| `beforeExecute` | `(ctx: PluginContext) => Promise<void> \| void` | 否 | SQL 执行前钩子，可修改 `ctx.sql` 和 `ctx.params` |
| `afterExecute` | `(ctx: PluginContext, result: any) => Promise<any> \| any` | 否 | SQL 执行后钩子，可修改返回结果 |

### 执行顺序

插件按 `order` 字段升序排列后依次执行：

1. 所有插件的 `beforeExecute` 按 order 顺序执行
2. 执行 SQL（使用可能被插件修改过的 sql / params）
3. 所有插件的 `afterExecute` 按 order 顺序执行

### 示例

```ts
import type { Plugin } from 'node-mybatis-plus'

const sqlLogPlugin: Plugin = {
  name: 'sql-log',
  order: 1,
  beforeExecute(ctx) {
    console.log(`[SQL] ${ctx.sql}`)
    console.log(`[Params] ${JSON.stringify(ctx.params)}`)
  },
  afterExecute(ctx, result) {
    console.log(`[Result] ${JSON.stringify(result)}`)
  },
}
```

## PluginContext

插件上下文对象，在 `beforeExecute` 和 `afterExecute` 之间共享。插件可以修改 `sql` 和 `params` 字段来改写即将执行的 SQL。

```ts
interface PluginContext {
  node: SqlNode
  sql: string
  params: any[]
  entityMeta: EntityMeta
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `node` | `SqlNode` | SQL AST 节点，描述当前操作的结构化表示 |
| `sql` | `string` | 即将执行的 SQL 字符串，`beforeExecute` 中可修改 |
| `params` | `any[]` | SQL 参数列表，`beforeExecute` 中可修改 |
| `entityMeta` | `EntityMeta` | 当前操作的实体元数据 |

### SQL 改写示例

```ts
const tenantPlugin: Plugin = {
  name: 'tenant',
  order: 0,
  beforeExecute(ctx) {
    if (ctx.node.type === 'select') {
      ctx.sql = ctx.sql.replace('WHERE', 'WHERE tenant_id = 1 AND')
    }
  },
}
```

## SqlNode

SQL AST 节点的联合类型，表示四种 SQL 操作。详见 [类型定义](./types.md) 页面。

```ts
type SqlNode = SelectNode | InsertNode | UpdateNode | DeleteNode
```

## runPlugins

插件执行函数，按顺序运行所有插件的钩子并执行 SQL。通常由框架内部调用，无需手动使用。

```ts
function runPlugins(
  ds: DataSource,
  node: SqlNode,
  sql: string,
  params: any[],
  entityMeta: EntityMeta,
): Promise<any>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `ds` | `DataSource` | 数据源实例 |
| `node` | `SqlNode` | SQL AST 节点 |
| `sql` | `string` | SQL 字符串 |
| `params` | `any[]` | SQL 参数 |
| `entityMeta` | `EntityMeta` | 实体元数据 |

### 执行流程

```
beforeExecute(plugin1) → beforeExecute(plugin2) → ... → execute SQL → afterExecute(plugin1) → afterExecute(plugin2) → ...
```

## 注册插件

在创建数据源时通过 `plugins` 配置项注册：

```ts
import { createDataSource } from 'node-mybatis-plus'

const ds = createDataSource({
  type: 'mysql',
  database: 'mydb',
  username: 'root',
  password: '123456',
  plugins: [sqlLogPlugin, slowQueryPlugin],
})
```

## 内置插件

### createLogicDeletePlugin

创建逻辑删除插件实例。

```ts
function createLogicDeletePlugin(): Plugin
```

无需参数，直接调用即可。需要实体上有 `@LogicDelete` 装饰的字段才会生效。

```ts
import { createLogicDeletePlugin } from 'node-mybatis-plus'

plugins: [createLogicDeletePlugin()]
```

详见 [逻辑删除指南](/guide/logic-delete)。

---

### createAutoFillPlugin

创建自动填充插件实例。

```ts
function createAutoFillPlugin(options: AutoFillOptions): Plugin
```

```ts
interface AutoFillOptions {
  handler: (fieldName: string, strategy: FillStrategy) => any
}

type FillStrategy = 'insert' | 'update' | 'insertAndUpdate'
```

```ts
import { createAutoFillPlugin } from 'node-mybatis-plus'

plugins: [
  createAutoFillPlugin({
    handler: (field) => {
      if (field === 'createTime' || field === 'updateTime') return new Date()
    }
  })
]
```

详见 [自动填充指南](/guide/auto-fill)。

---

### createMultiTenantPlugin

创建多租户插件实例。

```ts
function createMultiTenantPlugin(options: MultiTenantOptions): Plugin
```

```ts
interface MultiTenantOptions {
  getTenantId: () => any | Promise<any>
  tenantColumn?: string       // 默认 'tenant_id'
  ignoreTables?: string[]
  fillOnInsert?: boolean      // 默认 true
}
```

```ts
import { createMultiTenantPlugin } from 'node-mybatis-plus'

plugins: [
  createMultiTenantPlugin({
    getTenantId: () => requestContext.getStore()?.tenantId,
    ignoreTables: ['sys_config'],
  })
]
```

详见 [多租户指南](/guide/multi-tenant)。
