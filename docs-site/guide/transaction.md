# 事务管理

node-mybatis-plus 提供两种事务管理方式：**编程式事务**（`withTransaction`）和**声明式事务**（`@Transactional` 装饰器）。两者底层都基于 `AsyncLocalStorage` 实现事务连接的自动传播，嵌套调用时复用外层事务。

## 编程式事务 withTransaction

`withTransaction` 接收一个 `DataSource` 和一个 `async` 回调函数。回调正常结束自动 `commit`，抛出异常自动 `rollback`：

```ts
import { createDataSource, BaseMapper, withTransaction } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '******',
});

class UserMapper extends BaseMapper<User> {}
class OrderMapper extends BaseMapper<Order> {}

const userMapper = new UserMapper(User, ds);
const orderMapper = new OrderMapper(Order, ds);

// 正常结束 → 自动 commit
await withTransaction(ds, async () => {
  await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
  await orderMapper.insert({ userId: 1, orderNo: 'ORD-001', amount: 99.9 });
});

// 抛异常 → 自动 rollback，两条插入都不会生效
await withTransaction(ds, async () => {
  await userMapper.insert({ userName: '李四', age: 25, email: 'ls@test.com' });
  throw new Error('业务校验失败');
  // 上面的 insert 会被回滚
});
```

::: tip
`withTransaction` 内部会获取一个数据库连接并执行 `BEGIN`，回调中所有通过同一 `DataSource` 执行的 SQL 都会自动使用该事务连接。
:::

## @Transactional 装饰器

`@Transactional` 是方法装饰器，使用前需要先调用 `setDefaultDataSource` 注册默认数据源：

```ts
import { setDefaultDataSource, Transactional } from 'node-mybatis-plus';

// 注册默认数据源（通常在应用启动时调用一次）
setDefaultDataSource(ds);
```

然后在 Service 类的方法上使用 `@Transactional()`：

```ts
class UserService {
  @Transactional()
  async createUser(name: string, age: number, email: string) {
    const userId = await userMapper.insert({ userName: name, age, email });
    await orderMapper.insert({ userId, orderNo: 'INIT-001', amount: 0 });
    // 方法正常结束 → 自动 commit
    // 方法抛异常 → 自动 rollback
    return userId;
  }
}

const userService = new UserService();
await userService.createUser('张三', 20, 'zs@test.com');
```

### 指定数据源

如果有多个数据源，可以通过 `options.datasource` 指定：

```ts
class ReportService {
  @Transactional({ datasource: reportDs })
  async generateReport() {
    // 使用 reportDs 的事务连接
  }
}
```

::: warning
使用 `@Transactional` 前必须调用 `setDefaultDataSource(ds)` 或在装饰器参数中传入 `datasource`，否则会抛出错误。
:::

## 事务传播机制

node-mybatis-plus 的事务传播基于 `AsyncLocalStorage`。当嵌套调用带有事务的方法时，内层方法会**自动复用外层的事务连接**，而不是开启新事务：

```ts
class OrderService {
  @Transactional()
  async createOrder(userId: number, items: OrderItem[]) {
    const orderId = await orderMapper.insert({
      userId,
      orderNo: `ORD-${Date.now()}`,
      amount: items.reduce((sum, i) => sum + i.price, 0),
    });

    // 调用另一个 @Transactional 方法 → 复用当前事务
    await this.updateStock(items);

    return orderId;
  }

  @Transactional()
  async updateStock(items: OrderItem[]) {
    for (const item of items) {
      await stockMapper.lambdaUpdate()
        .set('quantity', item.currentQty - item.orderQty)
        .eq('productId', item.productId)
        .execute();
    }
    // 单独调用 → 独立事务
    // 被 createOrder 调用 → 复用外层事务
  }
}
```

### 传播原理

```
createOrder() 开始
  ├─ AsyncLocalStorage 存储事务连接
  ├─ INSERT order → 使用事务连接
  ├─ updateStock() 开始
  │   ├─ 检测到已有事务连接 → 复用，不再 BEGIN
  │   └─ UPDATE stock → 使用同一事务连接
  └─ 正常结束 → COMMIT（一次性提交所有操作）
```

::: tip
事务传播的判断条件是：当前 `AsyncLocalStorage` 上下文中已存在同一 `DataSource` 的事务连接。如果是不同的 `DataSource`，则会开启独立事务。
:::

### 编程式事务同样支持传播

`withTransaction` 也支持嵌套传播，行为与 `@Transactional` 一致：

```ts
await withTransaction(ds, async () => {
  await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });

  // 嵌套 withTransaction → 复用外层事务
  await withTransaction(ds, async () => {
    await orderMapper.insert({ userId: 1, orderNo: 'ORD-001', amount: 99.9 });
  });

  // 两条 insert 在同一个事务中
});
```

## 错误处理

事务中任何位置抛出异常，整个事务都会回滚：

```ts
class PaymentService {
  @Transactional()
  async pay(orderId: number, amount: number) {
    // 1. 扣减余额
    await accountMapper.lambdaUpdate()
      .set('balance', currentBalance - amount)
      .eq('id', accountId)
      .execute();

    // 2. 创建支付记录
    await paymentMapper.insert({ orderId, amount, status: 'paid' });

    // 3. 如果这里抛异常，步骤 1 和 2 都会回滚
    if (amount > 10000) {
      throw new Error('单笔支付不能超过 10000');
    }
  }
}
```

## 下一步

- [插件机制](/guide/plugin) — 在 SQL 执行前后介入，实现日志、审计等能力
- [多数据库切换](/guide/multi-database) — 一套代码切换 MySQL / PostgreSQL / SQLite
