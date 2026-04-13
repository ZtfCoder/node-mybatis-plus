# 分页查询

node-mybatis-plus 提供两种分页方式：`lambdaQuery` 链式分页和 `BaseMapper.selectPage` 方法。两者返回相同的 `Page<T>` 结构。

## Page\<T\> 返回结构

所有分页查询都返回 `Page<T>` 对象：

```ts
interface Page<T> {
  records: T[];   // 当前页数据列表
  total: number;  // 总记录数
  page: number;   // 当前页码（从 1 开始）
  size: number;   // 每页大小
  pages: number;  // 总页数
}
```

示例返回值：

```ts
{
  records: [
    { id: 1, userName: '张三', age: 20, email: 'zs@test.com' },
    { id: 2, userName: '李四', age: 25, email: 'ls@test.com' },
  ],
  total: 50,    // 共 50 条记录
  page: 1,      // 第 1 页
  size: 10,     // 每页 10 条
  pages: 5,     // 共 5 页
}
```

::: tip
`pages` 字段自动计算：`Math.ceil(total / size)`。
:::

## lambdaQuery 链式分页

通过 `pageResult(page, size)` 终结方法执行分页查询：

```ts
const page = await userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByAsc('age')
  .pageResult(1, 10);

console.log(page.records);  // 当前页数据
console.log(page.total);    // 总记录数
console.log(page.pages);    // 总页数
```

可以结合所有条件方法和排序：

```ts
const page = await userMapper.lambdaQuery()
  .like('userName', '张')
  .ge('age', 18)
  .le('age', 60)
  .orderByDesc('id')
  .pageResult(2, 20);  // 第 2 页，每页 20 条
```

### 动态条件分页

```ts
async function searchUsers(params: {
  name?: string;
  minAge?: number;
  page: number;
  size: number;
}) {
  return userMapper.lambdaQuery()
    .eq(params.name != null, 'userName', params.name)
    .ge(params.minAge != null, 'age', params.minAge)
    .orderByDesc('id')
    .pageResult(params.page, params.size);
}
```

## BaseMapper 分页方法

`selectPage` 方法提供更直接的分页调用方式：

```ts
// 无条件分页
const page = await userMapper.selectPage(1, 10);

// 带条件分页
const wrapper = userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByAsc('age');
const page = await userMapper.selectPage(1, 10, wrapper);
```

方法签名：

```ts
selectPage(page: number, size: number, wrapper?: LambdaQueryWrapper<T>): Promise<Page<T>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | `number` | 页码，从 1 开始 |
| `size` | `number` | 每页大小 |
| `wrapper` | `LambdaQueryWrapper<T>` | 可选，查询条件构造器 |

## 执行原理

分页查询内部自动执行两条 SQL：

1. **数据查询** — 带 `LIMIT` 和 `OFFSET` 的查询，获取当前页数据
2. **总数查询** — `SELECT COUNT(*)` 查询，获取满足条件的总记录数

两条 SQL 并行执行，性能最优：

```sql
-- 数据查询
SELECT * FROM sys_user WHERE age >= 18 ORDER BY age ASC LIMIT 10 OFFSET 0

-- 总数查询
SELECT COUNT(*) AS total FROM sys_user WHERE age >= 18
```

::: warning
分页查询建议配合 `orderBy` 使用，否则不同页的数据顺序可能不稳定。
:::

## 完整示例

```ts
// 用户列表接口：支持搜索 + 分页
async function getUserList(params: {
  keyword?: string;
  status?: number;
  page: number;
  size: number;
}) {
  const result = await userMapper.lambdaQuery()
    .like(params.keyword != null, 'userName', params.keyword)
    .eq(params.status != null, 'status', params.status)
    .orderByDesc('id')
    .pageResult(params.page, params.size);

  return {
    list: result.records,
    total: result.total,
    pages: result.pages,
    currentPage: result.page,
    pageSize: result.size,
  };
}
```

## 下一步

- [自定义 SQL](/guide/custom-sql) — 使用原生 SQL 查询
- [Lambda 链式查询](/guide/lambda-query) — 更多查询技巧
