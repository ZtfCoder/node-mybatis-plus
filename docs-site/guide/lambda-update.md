# Lambda 更新

`lambdaUpdate()` 提供链式更新能力，通过 `set` 方法指定要更新的字段，通过条件方法指定 WHERE 条件，最终调用 `execute()` 执行更新。

## 基本用法

```ts
await userMapper.lambdaUpdate()
  .set('age', 25)
  .set('email', 'new@test.com')
  .eq('userName', '张三')
  .execute();
```

```sql
UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE user_name = '张三'
```

### 三步走

1. **`lambdaUpdate()`** — 获取更新构造器
2. **`.set(column, value)`** — 指定要更新的字段和值（可多次调用）
3. **`.execute()`** — 执行更新

## set 方法

`set` 方法用于指定要更新的字段：

```ts
// 基本用法
.set('age', 25)
.set('email', 'new@test.com')
.set('userName', '李四')
```

可以链式调用多个 `set`，每个 `set` 对应一个 `SET` 子句。

## 条件方法

`lambdaUpdate()` 支持与 `lambdaQuery()` 完全相同的条件方法：

```ts
await userMapper.lambdaUpdate()
  .set('status', 1)
  .ge('age', 18)
  .like('email', '@company.com')
  .execute();
```

```sql
UPDATE sys_user SET status = 1 WHERE age >= 18 AND email LIKE '%@company.com%'
```

所有条件操作符（`eq`、`ne`、`gt`、`ge`、`lt`、`le`、`like`、`between`、`in`、`isNull` 等）均可使用。

## 动态 SET

`set` 方法支持动态条件，第一个参数传 `boolean`，为 `false` 时跳过该字段：

```ts
async function updateUser(
  id: number,
  newAge?: number,
  newEmail?: string,
) {
  return userMapper.lambdaUpdate()
    .set(newAge != null, 'age', newAge)
    .set(newEmail != null, 'email', newEmail)
    .eq('id', id)
    .execute();
}

// updateUser(1, 25)
// → UPDATE sys_user SET age = 25 WHERE id = 1

// updateUser(1, 25, 'new@test.com')
// → UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE id = 1

// updateUser(1, undefined, 'new@test.com')
// → UPDATE sys_user SET email = 'new@test.com' WHERE id = 1
```

::: tip
动态 SET 非常适合"部分更新"场景 — 前端只传了哪些字段，就只更新哪些字段。
:::

## execute 返回值

`execute()` 返回 `Promise<number>`，值为**影响的行数**：

```ts
const affected = await userMapper.lambdaUpdate()
  .set('status', 0)
  .eq('userName', '张三')
  .execute();

console.log(`更新了 ${affected} 条记录`);
```

::: warning
如果没有调用任何 `set` 方法就执行 `execute()`，会抛出错误：`No SET clause specified.`
:::

## 完整示例

```ts
// 批量禁用超过 30 天未登录的用户
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const affected = await userMapper.lambdaUpdate()
  .set('status', 0)
  .set('disabledAt', new Date())
  .lt('lastLoginAt', thirtyDaysAgo)
  .eq('status', 1)
  .execute();

console.log(`已禁用 ${affected} 个用户`);
```

## 下一步

- [动态条件](/guide/dynamic-condition) — 动态条件详解
- [分页查询](/guide/pagination) — 分页查询详解
