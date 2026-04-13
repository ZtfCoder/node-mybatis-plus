# 多租户

多租户插件自动在 SQL 中追加租户隔离条件，无需在每个查询中手动添加 `WHERE tenant_id = ?`。

## 快速开始

### 1. 数据库表添加租户字段

```sql
ALTER TABLE sys_user ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0;
```

### 2. 注册插件

```ts
import { createDataSource, createMultiTenantPlugin } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  database: 'test',
  username: 'root',
  password: '******',
  plugins: [
    createMultiTenantPlugin({
      getTenantId: () => getCurrentTenantId(), // 从请求上下文获取当前租户 ID
    }),
  ],
});
```

### 3. 正常使用

注册插件后，所有 SQL 自动追加租户条件：

```ts
// SELECT → 自动追加 WHERE tenant_id = ?
const users = await userMapper.selectList();
// 实际执行：SELECT * FROM `sys_user` WHERE `tenant_id` = 42

// INSERT → 自动填充 tenant_id 列
await userMapper.insert({ userName: '张三', age: 20 });
// 实际执行：INSERT INTO `sys_user` (`user_name`, `age`, `tenant_id`) VALUES (?, ?, 42)

// UPDATE → 自动追加 AND tenant_id = ?
await userMapper.updateById({ id: 1, age: 25 });
// 实际执行：UPDATE `sys_user` SET `age` = ? WHERE `tenant_id` = 42 AND `id` = ?

// DELETE → 自动追加 AND tenant_id = ?
await userMapper.deleteById(1);
// 实际执行：DELETE FROM `sys_user` WHERE `tenant_id` = 42 AND `id` = ?
```

## 配置选项

```ts
interface MultiTenantOptions {
  /** 获取当前租户 ID 的函数（支持同步/异步） */
  getTenantId: () => any | Promise<any>;

  /** 租户字段的数据库列名，默认 'tenant_id' */
  tenantColumn?: string;

  /** 忽略多租户隔离的表名列表 */
  ignoreTables?: string[];

  /** 是否在 INSERT 时自动填充租户 ID，默认 true */
  fillOnInsert?: boolean;
}
```

### 完整配置示例

```ts
createMultiTenantPlugin({
  // 从 AsyncLocalStorage 获取当前请求的租户 ID
  getTenantId: () => requestContext.getStore()?.tenantId,

  // 自定义租户字段名
  tenantColumn: 'org_id',

  // 这些表不做租户隔离（如系统配置表、字典表）
  ignoreTables: ['sys_config', 'sys_dict', 'sys_menu'],

  // INSERT 时自动填充租户 ID（默认 true）
  fillOnInsert: true,
})
```

## 与 AsyncLocalStorage 结合使用

在 Web 框架中，通常通过 `AsyncLocalStorage` 在请求上下文中传递租户 ID：

```ts
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  tenantId: number;
  userId: string;
}

const requestStore = new AsyncLocalStorage<RequestContext>();

// Express 中间件
app.use((req, res, next) => {
  const tenantId = Number(req.headers['x-tenant-id']);
  requestStore.run({ tenantId, userId: req.user?.id }, next);
});

// 注册插件时使用
createMultiTenantPlugin({
  getTenantId: () => requestStore.getStore()?.tenantId,
})
```

## getTenantId 返回 null/undefined 时的行为

当 `getTenantId()` 返回 `null` 或 `undefined` 时，插件会跳过租户条件追加。这适用于超级管理员场景：

```ts
createMultiTenantPlugin({
  getTenantId: () => {
    const ctx = requestStore.getStore();
    // 超级管理员返回 null，跳过租户隔离
    if (ctx?.isSuperAdmin) return null;
    return ctx?.tenantId;
  },
})
```

## 插件行为说明

| 操作 | 原始 SQL | 改写后 SQL（tenantId = 42） |
|------|----------|---------------------------|
| `selectList()` | `SELECT * FROM t` | `SELECT * FROM t WHERE tenant_id = 42` |
| `selectList(wrapper)` | `SELECT * FROM t WHERE age >= ?` | `SELECT * FROM t WHERE tenant_id = 42 AND age >= ?` |
| `insert(entity)` | `INSERT INTO t (name) VALUES (?)` | `INSERT INTO t (name, tenant_id) VALUES (?, 42)` |
| `updateById(entity)` | `UPDATE t SET age = ? WHERE id = ?` | `UPDATE t SET age = ? WHERE tenant_id = 42 AND id = ?` |
| `deleteById(1)` | `DELETE FROM t WHERE id = ?` | `DELETE FROM t WHERE tenant_id = 42 AND id = ?` |

::: warning
`rawQuery` 执行的自定义 SQL 不会自动追加租户条件，需要手动处理。
:::

## 与逻辑删除插件组合使用

两个插件可以同时注册，注意 `order` 的执行顺序：

```ts
plugins: [
  createLogicDeletePlugin(),   // order: -100，最先执行
  createMultiTenantPlugin({    // order: -80，其次执行
    getTenantId: () => getTenantId(),
  }),
]
```

## 下一步

- [逻辑删除](/guide/logic-delete) — 软删除数据
- [自动填充](/guide/auto-fill) — 自动填充创建时间、更新时间等字段
