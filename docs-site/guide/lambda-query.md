# Lambda 链式查询

Lambda 链式查询是 node-mybatis-plus 最核心的能力。通过 `lambdaQuery()` 入口获取查询构造器，以链式调用的方式构建查询条件，最终通过终结方法执行查询。

## 基本用法

```ts
const users = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .ge('age', 18)
  .like('email', '@gmail')
  .orderByDesc('id')
  .list();
```

上面的代码等价于：

```sql
SELECT * FROM sys_user
WHERE user_name = '张三' AND age >= 18 AND email LIKE '%@gmail%'
ORDER BY id DESC
```

## 条件方法

所有条件方法都支持两种调用方式：

```ts
// 标准调用
.eq('userName', '张三')

// 动态条件调用（第一个参数为 boolean，false 时跳过）
.eq(name != null, 'userName', name)
```

### 条件操作符一览

| 方法 | 对应 SQL | 示例 | 生成 SQL |
|------|----------|------|----------|
| `eq` | `= ?` | `.eq('userName', '张三')` | `user_name = '张三'` |
| `ne` | `!= ?` | `.ne('status', 0)` | `status != 0` |
| `gt` | `> ?` | `.gt('age', 18)` | `age > 18` |
| `ge` | `>= ?` | `.ge('age', 18)` | `age >= 18` |
| `lt` | `< ?` | `.lt('age', 60)` | `age < 60` |
| `le` | `<= ?` | `.le('age', 60)` | `age <= 60` |
| `like` | `LIKE '%x%'` | `.like('name', '张')` | `name LIKE '%张%'` |
| `likeLeft` | `LIKE '%x'` | `.likeLeft('name', '三')` | `name LIKE '%三'` |
| `likeRight` | `LIKE 'x%'` | `.likeRight('name', '张')` | `name LIKE '张%'` |
| `between` | `BETWEEN ? AND ?` | `.between('age', 18, 30)` | `age BETWEEN 18 AND 30` |
| `in` | `IN (?, ?)` | `.in('id', [1, 2, 3])` | `id IN (1, 2, 3)` |
| `notIn` | `NOT IN (?, ?)` | `.notIn('id', [4, 5])` | `id NOT IN (4, 5)` |
| `isNull` | `IS NULL` | `.isNull('email')` | `email IS NULL` |
| `isNotNull` | `IS NOT NULL` | `.isNotNull('email')` | `email IS NOT NULL` |
| `or` | `OR (...)` | `.or(q => q.eq(...))` | 见下方 OR 嵌套 |
| `and` | `AND (...)` | `.and(q => q.ge(...))` | 见下方 AND 嵌套 |

### OR 嵌套

默认情况下，多个条件之间是 `AND` 关系。使用 `or()` 可以创建 OR 分组：

```ts
const users = await userMapper.lambdaQuery()
  .ge('age', 18)
  .or(q => q.eq('userName', '张三').eq('userName', '李四'))
  .list();
```

```sql
SELECT * FROM sys_user
WHERE age >= 18 AND (user_name = '张三' OR user_name = '李四')
```

### AND 嵌套

在 OR 分组内部需要 AND 条件时，使用 `and()`：

```ts
const users = await userMapper.lambdaQuery()
  .or(q => q
    .and(q2 => q2.eq('userName', '张三').ge('age', 20))
    .and(q2 => q2.eq('userName', '李四').ge('age', 25))
  )
  .list();
```

```sql
SELECT * FROM sys_user
WHERE (
  (user_name = '张三' AND age >= 20)
  OR
  (user_name = '李四' AND age >= 25)
)
```

## 排序

```ts
// 单字段排序
.orderByAsc('age')
.orderByDesc('id')

// 多字段排序
.orderByAsc('age', 'userName')
```

## select 指定列

默认查询所有列（`SELECT *`）。使用 `select()` 可以指定需要的列：

```ts
const users = await userMapper.lambdaQuery()
  .select('userName', 'age')
  .ge('age', 18)
  .list();
```

```sql
SELECT user_name, age FROM sys_user WHERE age >= 18
```

::: tip
指定列查询可以减少数据传输量，在列较多或数据量大时建议使用。
:::

## 终结方法

条件构造完成后，通过终结方法执行查询：

### list — 查询列表

```ts
const users = await userMapper.lambdaQuery()
  .ge('age', 18)
  .list();
// → User[]
```

### one — 查询单条

```ts
const user = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .one();
// → User | null
```

自动添加 `LIMIT 1`，未找到时返回 `null`。

### count — 查询数量

```ts
const total = await userMapper.lambdaQuery()
  .ge('age', 18)
  .count();
// → number
```

生成 `SELECT COUNT(*) AS total FROM ...`。

### pageResult — 分页查询

```ts
const page = await userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByAsc('age')
  .pageResult(1, 10);
// → { records: User[], total: number, page: 1, size: 10, pages: number }
```

自动执行两条 SQL：一条查数据，一条查总数。详见 [分页查询](/guide/pagination)。

## 完整示例

```ts
// 搜索用户：支持按姓名、年龄范围、邮箱模糊查询
async function searchUsers(params: {
  name?: string;
  minAge?: number;
  maxAge?: number;
  email?: string;
  page: number;
  size: number;
}) {
  return userMapper.lambdaQuery()
    .eq(params.name != null, 'userName', params.name)
    .ge(params.minAge != null, 'age', params.minAge)
    .le(params.maxAge != null, 'age', params.maxAge)
    .like(params.email != null, 'email', params.email)
    .orderByDesc('id')
    .pageResult(params.page, params.size);
}
```

## 下一步

- [动态条件](/guide/dynamic-condition) — 深入了解动态条件机制
- [Lambda 更新](/guide/lambda-update) — 链式更新操作
