# 自定义 SQL

当内置的 CRUD 方法和链式查询无法满足需求时，可以使用 `rawQuery` 方法执行自定义 SQL。node-mybatis-plus 提供 `#{param}` 命名参数绑定，自动转为预编译占位符，防止 SQL 注入。

## rawQuery 方法

```ts
const result = await userMapper.rawQuery(sql, params?);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `sql` | `string` | SQL 语句，支持 `#{param}` 命名参数 |
| `params` | `Record<string, any>` | 可选，命名参数对象 |

## 命名参数绑定

使用 `#{paramName}` 语法绑定参数。参数会自动转为数据库的预编译占位符（MySQL 用 `?`，PostgreSQL 用 `$1`），防止 SQL 注入：

```ts
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user WHERE age > #{age} AND user_name LIKE #{name}',
  { age: 18, name: '%张%' }
);
```

实际执行的 SQL（以 MySQL 为例）：

```sql
SELECT * FROM sys_user WHERE age > ? AND user_name LIKE ?
-- 参数: [18, '%张%']
```

::: tip
`#{param}` 语法借鉴自 MyBatis，如果你用过 Java 的 MyBatis，会非常熟悉。
:::

### 多参数示例

```ts
const users = await userMapper.rawQuery(
  `SELECT * FROM sys_user
   WHERE age BETWEEN #{minAge} AND #{maxAge}
   AND status = #{status}
   ORDER BY id DESC
   LIMIT #{limit}`,
  { minAge: 18, maxAge: 60, status: 1, limit: 100 }
);
```

## 防 SQL 注入

`#{param}` 命名参数会被转换为预编译占位符，参数值通过参数化查询传递给数据库，**不会拼接到 SQL 字符串中**，从根本上防止 SQL 注入攻击。

```ts
// ✅ 安全：使用命名参数
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user WHERE user_name = #{name}',
  { name: userInput }
);

// ❌ 危险：直接拼接字符串（不要这样做！）
const users = await userMapper.rawQuery(
  `SELECT * FROM sys_user WHERE user_name = '${userInput}'`
);
```

::: danger
永远不要将用户输入直接拼接到 SQL 字符串中。始终使用 `#{param}` 命名参数绑定。
:::

### 不同数据库的占位符转换

| 数据库 | `#{param}` 转换为 |
|--------|-------------------|
| MySQL | `?` |
| PostgreSQL | `$1`, `$2`, ... |
| SQLite | `?` |

转换由方言层自动处理，你无需关心底层差异。

## 无参数查询

不需要参数时，可以省略第二个参数：

```ts
// 无参数查询
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user ORDER BY id DESC LIMIT 10'
);

// 聚合查询
const result = await userMapper.rawQuery(
  'SELECT COUNT(*) AS total, AVG(age) AS avgAge FROM sys_user'
);
console.log(result[0].total, result[0].avgAge);

// 多表关联查询
const orders = await userMapper.rawQuery(
  `SELECT u.user_name, o.order_no, o.amount
   FROM sys_user u
   INNER JOIN sys_order o ON u.id = o.user_id
   ORDER BY o.created_at DESC`
);
```

## 完整示例

```ts
// 复杂统计查询：按年龄段统计用户数
const stats = await userMapper.rawQuery(
  `SELECT
     CASE
       WHEN age < 18 THEN '未成年'
       WHEN age BETWEEN 18 AND 30 THEN '青年'
       WHEN age BETWEEN 31 AND 50 THEN '中年'
       ELSE '老年'
     END AS ageGroup,
     COUNT(*) AS count
   FROM sys_user
   WHERE status = #{status}
   GROUP BY ageGroup
   ORDER BY count DESC`,
  { status: 1 }
);
// → [{ ageGroup: '青年', count: 150 }, { ageGroup: '中年', count: 80 }, ...]
```

::: warning
`rawQuery` 返回的是数据库驱动的原始结果，字段名为数据库列名（snake_case），不会自动转换为实体属性名（camelCase）。
:::

## 下一步

- [BaseMapper CRUD](/guide/base-mapper) — 内置 CRUD 方法总览
- [Lambda 链式查询](/guide/lambda-query) — 更灵活的条件构造方式
