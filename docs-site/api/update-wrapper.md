# LambdaUpdateWrapper

`LambdaUpdateWrapper<T>` 提供类型安全的链式更新构造器，支持动态 SET 和条件拼接。继承自 `AbstractWrapper`，拥有与 `LambdaQueryWrapper` 相同的条件方法。

## 创建方式

```ts
// 通过 BaseMapper 创建（推荐，自动绑定数据源）
const wrapper = userMapper.lambdaUpdate()

// 手动创建
import { LambdaUpdateWrapper } from 'node-mybatis-plus'
const wrapper = new LambdaUpdateWrapper<User>(entityMeta)
```

## SET 方法

### set

设置要更新的字段值。支持动态条件控制。

```ts
set(column: keyof T & string, value: any): this
set(condition: boolean, column: keyof T & string, value: any): this
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `condition` | `boolean` | 可选，为 `false` 时跳过该 SET |
| `column` | `keyof T & string` | 实体属性名 |
| `value` | `any` | 要设置的值 |

```ts
// 直接设置
wrapper.set('status', 1)

// 动态设置：email 不为空时才更新
wrapper.set(email != null, 'email', email)
```

## 条件方法

`LambdaUpdateWrapper` 继承了 `AbstractWrapper` 的全部条件方法，用法与 `LambdaQueryWrapper` 完全一致。

| 方法 | 对应 SQL | 示例 |
|------|----------|------|
| `eq(column, value)` | `column = value` | `.eq('status', 1)` |
| `ne(column, value)` | `column != value` | `.ne('status', 0)` |
| `gt(column, value)` | `column > value` | `.gt('age', 18)` |
| `ge(column, value)` | `column >= value` | `.ge('age', 18)` |
| `lt(column, value)` | `column < value` | `.lt('age', 60)` |
| `le(column, value)` | `column <= value` | `.le('age', 60)` |
| `like(column, value)` | `column LIKE '%value%'` | `.like('userName', '张')` |
| `likeLeft(column, value)` | `column LIKE '%value'` | `.likeLeft('email', '@qq.com')` |
| `likeRight(column, value)` | `column LIKE 'value%'` | `.likeRight('userName', '张')` |
| `between(column, val1, val2)` | `column BETWEEN val1 AND val2` | `.between('age', 18, 30)` |
| `in(column, values)` | `column IN (...)` | `.in('id', [1, 2, 3])` |
| `notIn(column, values)` | `column NOT IN (...)` | `.notIn('status', [0, -1])` |
| `isNull(column)` | `column IS NULL` | `.isNull('deletedAt')` |
| `isNotNull(column)` | `column IS NOT NULL` | `.isNotNull('email')` |
| `or(fn)` | `OR (...)` | `.or(w => w.eq('a', 1))` |
| `and(fn)` | `AND (...)` | `.and(w => w.eq('a', 1))` |

所有条件方法均支持动态条件重载：

```ts
wrapper.eq(condition, 'column', value)
```

## 终结方法

### execute

执行更新操作，返回影响的行数。

```ts
execute(): Promise<number>
```

::: warning 注意
调用 `execute()` 前必须至少调用一次 `set()` 方法，否则会抛出异常。
:::

```ts
const affected = await userMapper.lambdaUpdate()
  .set('status', 0)
  .eq('lastLoginTime', null)
  .execute()
// affected = 影响的行数
```

## 完整示例

```ts
// 动态 SET + 动态条件
const affected = await userMapper.lambdaUpdate()
  .set('status', newStatus)
  .set(email != null, 'email', email)
  .set(phone != null, 'phone', phone)
  .eq('id', userId)
  .execute()
```

```ts
// 批量更新：将过期用户状态设为禁用
const affected = await userMapper.lambdaUpdate()
  .set('status', 0)
  .lt('expireTime', new Date())
  .eq('status', 1)
  .execute()
```
