# LambdaQueryWrapper

`LambdaQueryWrapper<T>` 提供类型安全的链式查询构造器，支持动态条件拼接、排序、分组和分页。所有条件方法均支持两种调用形式：直接传参和带条件控制。

## 创建方式

```ts
// 通过 BaseMapper 创建（推荐，自动绑定数据源）
const wrapper = userMapper.lambdaQuery()

// 手动创建
import { LambdaQueryWrapper } from 'node-mybatis-plus'
const wrapper = new LambdaQueryWrapper<User>(entityMeta)
```

## 条件方法

所有条件方法均支持两种重载：

```ts
// 直接调用
wrapper.eq('status', 1)

// 动态条件：第一个参数为 boolean，为 false 时跳过该条件
wrapper.eq(name != null, 'userName', name)
```

| 方法 | 对应 SQL | 示例 |
|------|----------|------|
| `eq(column, value)` | `column = value` | `.eq('status', 1)` → `status = 1` |
| `ne(column, value)` | `column != value` | `.ne('status', 0)` → `status != 0` |
| `gt(column, value)` | `column > value` | `.gt('age', 18)` → `age > 18` |
| `ge(column, value)` | `column >= value` | `.ge('age', 18)` → `age >= 18` |
| `lt(column, value)` | `column < value` | `.lt('age', 60)` → `age < 60` |
| `le(column, value)` | `column <= value` | `.le('age', 60)` → `age <= 60` |
| `like(column, value)` | `column LIKE '%value%'` | `.like('userName', '张')` → `user_name LIKE '%张%'` |
| `likeLeft(column, value)` | `column LIKE '%value'` | `.likeLeft('email', '@qq.com')` → `email LIKE '%@qq.com'` |
| `likeRight(column, value)` | `column LIKE 'value%'` | `.likeRight('userName', '张')` → `user_name LIKE '张%'` |
| `between(column, val1, val2)` | `column BETWEEN val1 AND val2` | `.between('age', 18, 30)` → `age BETWEEN 18 AND 30` |
| `in(column, values)` | `column IN (...)` | `.in('id', [1, 2, 3])` → `id IN (1, 2, 3)` |
| `notIn(column, values)` | `column NOT IN (...)` | `.notIn('status', [0, -1])` → `status NOT IN (0, -1)` |
| `isNull(column)` | `column IS NULL` | `.isNull('deletedAt')` → `deleted_at IS NULL` |
| `isNotNull(column)` | `column IS NOT NULL` | `.isNotNull('email')` → `email IS NOT NULL` |

### or / and 嵌套

使用回调函数构建嵌套条件组：

```ts
// OR 嵌套：WHERE status = 1 AND (age > 30 OR level > 5)
wrapper
  .eq('status', 1)
  .or(w => {
    w.gt('age', 30).gt('level', 5)
  })

// AND 嵌套：WHERE status = 1 OR (age > 18 AND level > 3)
wrapper
  .eq('status', 1)
  .and(w => {
    w.gt('age', 18).gt('level', 3)
  })
```

## 查询控制方法

### select

指定查询返回的列，不调用则默认 `SELECT *`。

```ts
select(...columns: (keyof T & string)[]): this
```

```ts
wrapper.select('id', 'userName', 'email')
// SELECT id, user_name, email FROM ...
```

### page

设置分页参数。

```ts
page(page: number, size: number): this
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | `number` | 页码，从 1 开始 |
| `size` | `number` | 每页条数 |

```ts
wrapper.page(2, 10)
// LIMIT 10 OFFSET 10
```

### orderByAsc

按指定列升序排序，支持多列。

```ts
orderByAsc(...columns: (keyof T & string)[]): this
```

```ts
wrapper.orderByAsc('createTime', 'id')
// ORDER BY create_time ASC, id ASC
```

### orderByDesc

按指定列降序排序，支持多列。

```ts
orderByDesc(...columns: (keyof T & string)[]): this
```

```ts
wrapper.orderByDesc('createTime')
// ORDER BY create_time DESC
```

### groupBy

按指定列分组，支持多列。

```ts
groupBy(...columns: (keyof T & string)[]): this
```

```ts
wrapper.groupBy('department', 'level')
// GROUP BY department, level
```

## 终结方法

终结方法执行 SQL 并返回结果，调用后链式构建结束。

### list

执行查询，返回结果列表。

```ts
list(): Promise<T[]>
```

```ts
const users = await userMapper.lambdaQuery()
  .eq('status', 1)
  .orderByDesc('createTime')
  .list()
```

### one

查询单条记录，内部自动添加 `LIMIT 1`。未找到返回 `null`。

```ts
one(): Promise<T | null>
```

```ts
const user = await userMapper.lambdaQuery()
  .eq('email', 'test@example.com')
  .one()
```

### count

查询满足条件的记录总数。

```ts
count(): Promise<number>
```

```ts
const total = await userMapper.lambdaQuery()
  .eq('status', 1)
  .count()
```

### pageResult

分页查询，返回包含数据和分页信息的 `Page<T>` 对象。

```ts
pageResult(page: number, size: number): Promise<Page<T>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | `number` | 页码，从 1 开始 |
| `size` | `number` | 每页条数 |

```ts
const result = await userMapper.lambdaQuery()
  .eq('status', 1)
  .orderByDesc('createTime')
  .pageResult(1, 10)

// result.records — 当前页数据列表
// result.total   — 总记录数
// result.page    — 当前页码
// result.size    — 每页条数
// result.pages   — 总页数
```

## 完整示例

```ts
// 动态条件 + 分页 + 排序
const result = await userMapper.lambdaQuery()
  .eq('status', 1)
  .like(name != null, 'userName', name)
  .ge(minAge != null, 'age', minAge)
  .in(deptIds.length > 0, 'deptId', deptIds)
  .select('id', 'userName', 'email', 'age')
  .orderByDesc('createTime')
  .pageResult(1, 20)
```
