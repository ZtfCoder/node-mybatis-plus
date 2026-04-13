# 事务实现

node-mybatis-plus 的事务管理基于 Node.js 的 `AsyncLocalStorage` 实现自动传播，开发者无需手动传递事务连接对象。本文介绍事务的内部实现原理。

## AsyncLocalStorage 传播机制

### 核心问题

在传统的事务实现中，同一事务内的多个数据库操作需要共享同一个连接。常见做法是将事务连接作为参数逐层传递：

```ts
// ❌ 传统方式：手动传递事务连接
await userMapper.insert(user, { connection: txConn });
await orderMapper.insert(order, { connection: txConn });
```

这种方式侵入性强，所有方法签名都需要接受连接参数。

### AsyncLocalStorage 方案

node-mybatis-plus 使用 Node.js 内置的 `AsyncLocalStorage` 在异步调用链中自动传播事务上下文：

```ts
import { AsyncLocalStorage } from 'async_hooks';

interface TxContext {
  connection: Connection;   // 事务连接
  datasource: DataSource;   // 所属数据源
}

const txStore = new AsyncLocalStorage<TxContext>();
```

`txStore` 是一个全局的 `AsyncLocalStorage` 实例。在事务作用域内，任何异步操作都可以通过 `txStore.getStore()` 获取当前事务上下文，无需显式传参。

### 事务感知执行

DataSource 的 `execute` 方法在执行 SQL 前会检查是否处于事务上下文中：

```ts
async function txAwareExecute(ds: DataSource, sql: string, params: any[]): Promise<any> {
  const txCtx = txStore.getStore();
  if (txCtx && txCtx.datasource === ds) {
    // 在事务中 → 使用事务连接
    return txCtx.connection.query(sql, params);
  }
  // 不在事务中 → 走正常连接池
  return null;
}
```

通过 `txCtx.datasource === ds` 的检查，确保只有同一数据源的操作才会复用事务连接，避免跨数据源的事务混乱。

## 事务生命周期

```
BEGIN → 执行 SQL → COMMIT / ROLLBACK
```

完整的事务生命周期：

```
1. 从连接池获取一个专用连接
2. 执行 BEGIN 开启事务
3. 将连接存入 AsyncLocalStorage
4. 在作用域内执行用户代码
   ├── Mapper 操作自动检测到事务连接
   └── 所有 SQL 通过同一连接执行
5. 用户代码正常结束 → COMMIT
   用户代码抛出异常 → ROLLBACK
6. 释放连接回连接池
```

## withTransaction 实现原理

`withTransaction` 是编程式事务的核心函数：

```ts
async function withTransaction<T>(ds: DataSource, fn: () => Promise<T>): Promise<T> {
  // 1. 检查是否已在事务中（事务传播）
  const existing = txStore.getStore();
  if (existing && existing.datasource === ds) {
    return fn();  // 复用外层事务连接
  }

  // 2. 获取新连接
  const conn = await ds.getConnection();

  // 3. 开启事务
  await conn.query('BEGIN', []);

  // 4. 创建事务上下文
  const ctx: TxContext = { connection: conn, datasource: ds };

  try {
    // 5. 在 AsyncLocalStorage 作用域内执行用户代码
    const result = await txStore.run(ctx, fn);

    // 6. 正常结束 → 提交
    await conn.query('COMMIT', []);
    return result;
  } catch (e) {
    // 7. 异常 → 回滚
    await conn.query('ROLLBACK', []);
    throw e;
  } finally {
    // 8. 释放连接
    conn.release();
  }
}
```

关键步骤解析：

| 步骤 | 说明 |
|------|------|
| 检查已有事务 | 如果当前已在同一数据源的事务中，直接执行 `fn()` 复用连接 |
| `txStore.run(ctx, fn)` | 在 AsyncLocalStorage 作用域内执行 `fn`，作用域内所有异步操作都能通过 `txStore.getStore()` 获取 `ctx` |
| `COMMIT` / `ROLLBACK` | 根据 `fn` 是否抛异常决定提交或回滚 |
| `conn.release()` | 无论成功失败，`finally` 块确保连接归还连接池 |

使用示例：

```ts
await withTransaction(ds, async () => {
  await userMapper.insert(user);    // 自动使用事务连接
  await orderMapper.insert(order);  // 同一事务连接
  // 正常结束 → 自动 COMMIT
  // 抛异常 → 自动 ROLLBACK
});
```

## @Transactional 装饰器实现原理

`@Transactional` 是 `withTransaction` 的声明式封装，通过装饰器语法简化事务管理：

```ts
interface TransactionalOptions {
  datasource?: DataSource;
}

function Transactional(options?: TransactionalOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 确定数据源：优先使用 options 指定的，否则使用全局默认
      const ds = options?.datasource ?? defaultDataSource;
      if (!ds) {
        throw new Error('No DataSource available for @Transactional.');
      }
      // 包装为事务执行
      return withTransaction(ds, () => original.apply(this, args));
    };

    return descriptor;
  };
}
```

实现原理：

1. **方法包装** — 装饰器替换原始方法为一个新函数
2. **数据源解析** — 优先使用 `options.datasource`，否则使用 `setDefaultDataSource()` 注册的全局数据源
3. **委托 withTransaction** — 将原始方法的执行包装在 `withTransaction` 中
4. **检查 txStore** — `withTransaction` 内部检查是否已在事务中，决定复用还是新建

使用示例：

```ts
class UserService {
  @Transactional()
  async createUserWithOrder(user: User, order: Order) {
    await this.userMapper.insert(user);
    await this.orderMapper.insert(order);
    // 方法正常返回 → COMMIT
    // 方法抛异常 → ROLLBACK
  }
}
```

## 嵌套事务传播

当外层已存在事务时，内层的 `withTransaction` 或 `@Transactional` 会检测到已有事务上下文，直接复用外层连接而不是创建新事务：

```ts
// 外层事务
await withTransaction(ds, async () => {
  await userMapper.insert(user1);

  // 内层事务 → 检测到已有事务，复用连接
  await withTransaction(ds, async () => {
    await userMapper.insert(user2);
    // 不会单独 BEGIN/COMMIT
  });

  await userMapper.insert(user3);
  // 三个 insert 在同一个事务中
});
```

传播逻辑的关键代码：

```ts
const existing = txStore.getStore();
if (existing && existing.datasource === ds) {
  return fn();  // 直接执行，不创建新事务
}
```

判断条件：
- `existing` 不为空 — 当前在某个事务作用域内
- `existing.datasource === ds` — 是同一个数据源的事务

满足两个条件时，内层直接执行 `fn()` 而不执行 `BEGIN/COMMIT/ROLLBACK`，所有操作共享外层事务的连接和生命周期。

```
外层 withTransaction
├── BEGIN
├── insert(user1)
├── 内层 withTransaction → 检测到已有事务 → 直接执行 fn()
│   └── insert(user2)
├── insert(user3)
└── COMMIT（或 ROLLBACK）
```

:::warning 注意
当前实现中，内层事务的异常会直接冒泡到外层，导致整个事务回滚。不支持 Savepoint 级别的部分回滚。
:::
