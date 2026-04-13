# 动态条件

动态条件是 node-mybatis-plus 的核心设计之一。传统 ORM 中，可选查询参数需要大量 `if-else` 拼接 SQL，而动态条件让你用一行代码搞定。

## 原理

所有条件方法都支持**第一个参数传 `boolean`**。当值为 `false` 时，该条件自动跳过，不会出现在最终 SQL 中：

```ts
.eq(condition, 'column', value)
//  ^^^^^^^^^ 为 false 时，整行跳过
```

## 传统写法 vs 动态条件

### 传统 if-else 写法

```ts
async function searchUsers(name?: string, minAge?: number, email?: string) {
  const query = userMapper.lambdaQuery();

  if (name != null) {
    query.eq('userName', name);
  }
  if (minAge != null) {
    query.ge('age', minAge);
  }
  if (email != null) {
    query.like('email', email);
  }

  return query.list();
}
```

### 动态条件写法

```ts
async function searchUsers(name?: string, minAge?: number, email?: string) {
  return userMapper.lambdaQuery()
    .eq(name != null, 'userName', name)
    .ge(minAge != null, 'age', minAge)
    .like(email != null, 'email', email)
    .list();
}
```

::: tip
两种写法完全等价，但动态条件写法更简洁、更易读，且不会打断链式调用。
:::

## 查询动态条件示例

```ts
// 调用示例及生成的 SQL：

searchUsers('张三');
// → WHERE user_name = '张三'

searchUsers(undefined, 18);
// → WHERE age >= 18

searchUsers('张三', 18, '@gmail');
// → WHERE user_name = '张三' AND age >= 18 AND email LIKE '%@gmail%'

searchUsers();
// → SELECT * FROM sys_user（无 WHERE 条件）
```

所有条件方法都支持动态条件：

```ts
userMapper.lambdaQuery()
  .eq(hasName, 'userName', name)
  .ne(hasStatus, 'status', 0)
  .gt(hasMinAge, 'age', minAge)
  .ge(hasMinScore, 'score', minScore)
  .lt(hasMaxAge, 'age', maxAge)
  .le(hasMaxScore, 'score', maxScore)
  .like(hasKeyword, 'userName', keyword)
  .between(hasAgeRange, 'age', minAge, maxAge)
  .in(hasIds, 'id', ids)
  .notIn(hasExcludeIds, 'id', excludeIds)
  .isNull(checkNull, 'email')
  .isNotNull(checkNotNull, 'phone')
  .list();
```

## 更新动态条件

`lambdaUpdate()` 的 `set` 方法同样支持动态条件：

```ts
async function updateUser(
  id: number,
  newAge?: number,
  newEmail?: string,
  newName?: string,
) {
  return userMapper.lambdaUpdate()
    .set(newAge != null, 'age', newAge)
    .set(newEmail != null, 'email', newEmail)
    .set(newName != null, 'userName', newName)
    .eq('id', id)
    .execute();
}

// updateUser(1, 25)
// → UPDATE sys_user SET age = 25 WHERE id = 1

// updateUser(1, 25, 'new@test.com')
// → UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE id = 1

// updateUser(1, undefined, undefined, '李四')
// → UPDATE sys_user SET user_name = '李四' WHERE id = 1
```

WHERE 条件同样支持动态：

```ts
userMapper.lambdaUpdate()
  .set('status', 1)
  .eq(hasName, 'userName', name)
  .ge(hasMinAge, 'age', minAge)
  .execute();
```

## OR / AND 嵌套

动态条件可以与 `or()` / `and()` 嵌套组合使用：

### or 嵌套

```ts
const users = await userMapper.lambdaQuery()
  .ge('age', 18)
  .or(q => q
    .eq('userName', '张三')
    .eq('userName', '李四')
  )
  .list();
```

```sql
SELECT * FROM sys_user
WHERE age >= 18 AND (user_name = '张三' OR user_name = '李四')
```

### and 嵌套

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

### 实际场景

```ts
// 搜索：名字匹配 OR 邮箱匹配，且年龄 >= 18
async function search(keyword: string) {
  return userMapper.lambdaQuery()
    .ge('age', 18)
    .or(q => q
      .like('userName', keyword)
      .like('email', keyword)
    )
    .list();
}
// → WHERE age >= 18 AND (user_name LIKE '%keyword%' OR email LIKE '%keyword%')
```

## 下一步

- [Lambda 更新](/guide/lambda-update) — 链式更新操作
- [分页查询](/guide/pagination) — 分页查询详解
