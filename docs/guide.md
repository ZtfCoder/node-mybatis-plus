# node-mybatis-plus 使用说明

## 目录

- [安装](#安装)
- [实体定义](#实体定义)
- [数据源配置](#数据源配置)
- [BaseMapper CRUD](#basemapper-crud)
- [Lambda 链式查询](#lambda-链式查询)
- [动态条件](#动态条件)
- [OR / AND 嵌套](#or--and-嵌套)
- [Lambda 更新](#lambda-更新)
- [分页查询](#分页查询)
- [自定义 SQL](#自定义-sql)
- [事务管理](#事务管理)
- [多数据库切换](#多数据库切换)
- [项目结构](#项目结构)

---

## 安装

```bash
npm install node-mybatis-plus reflect-metadata
```

按需安装数据库驱动（至少装一个）：

```bash
npm install mysql2          # MySQL / PolarDB
npm install pg              # PostgreSQL
npm install better-sqlite3  # SQLite
```

在项目入口文件顶部引入 reflect-metadata：

```ts
import 'reflect-metadata';
```

---

## 实体定义

用装饰器将 TypeScript 类映射到数据库表：

```ts
import { Table, Column, Id } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  @Id({ type: 'auto' })   // 自增主键
  id: number;

  @Column('user_name')     // 显式指定列名
  userName: string;

  @Column()                // 自动转换：age → age
  age: number;

  @Column()                // 自动转换：email → email
  email: string;

  @Column({ exist: false }) // 非数据库字段，查询/插入时忽略
  displayName: string;
}
```

### 装饰器说明

**@Table(tableName)**

指定数据库表名。必须放在 class 上。

**@Id(options?)**

标记主键字段。options.type 可选值：
- `'auto'` — 数据库自增（默认），insert 时不传该字段
- `'uuid'` — UUID 主键
- `'input'` — 手动赋值

**@Column(nameOrOptions?)**

标记数据库列。三种用法：
- `@Column()` — 自动将 camelCase 属性名转为 snake_case 列名
- `@Column('user_name')` — 显式指定列名
- `@Column({ name: 'user_name', exist: false })` — 指定列名 + 标记非数据库字段

---

## 数据源配置

```ts
import { createDataSource } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',            // 'mysql' | 'postgres' | 'sqlite'
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: '******',
  pool: {                   // 可选
    min: 2,                 // 最小连接数
    max: 10,                // 最大连接数
    idleTimeout: 30000,     // 空闲超时（ms）
  },
});
```

SQLite 配置：

```ts
// 文件数据库
const ds = createDataSource({ type: 'sqlite', database: './data.db' });

// 内存数据库（测试用）
const ds = createDataSource({ type: 'sqlite', database: ':memory:' });
```

关闭数据源（应用退出时调用）：

```ts
await ds.close();
```

---

## BaseMapper CRUD

创建 Mapper：

```ts
import { BaseMapper } from 'node-mybatis-plus';

class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);
```

### 新增

```ts
// 单条新增，返回自增 ID
const id = await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });

// 批量新增，返回影响行数
const count = await userMapper.insertBatch([
  { userName: '李四', age: 25, email: 'ls@test.com' },
  { userName: '王五', age: 30, email: 'ww@test.com' },
]);
```

### 查询

```ts
// 按 ID 查询
const user = await userMapper.selectById(1);           // User | null

// 批量 ID 查询
const users = await userMapper.selectBatchIds([1, 2, 3]); // User[]

// 查询全部
const all = await userMapper.selectList();

// 带条件查询
const list = await userMapper.selectList(
  userMapper.lambdaQuery().ge('age', 18)
);

// 查询单条
const one = await userMapper.selectOne(
  userMapper.lambdaQuery().eq('userName', '张三')
);

// 查询数量
const count = await userMapper.selectCount();

// 分页查询
const page = await userMapper.selectPage(1, 10);
// → { records: User[], total: number, page: 1, size: 10, pages: number }
```

### 修改

```ts
// 按 ID 更新（只更新非 undefined 字段）
await userMapper.updateById({ id: 1, age: 21 });

// 条件更新
await userMapper.update(
  { age: 99 },
  userMapper.lambdaQuery().eq('userName', '张三')
);
```

### 删除

```ts
await userMapper.deleteById(1);
await userMapper.deleteBatchIds([2, 3]);
await userMapper.delete(userMapper.lambdaQuery().lt('age', 18));
```

---

## Lambda 链式查询

通过 `lambdaQuery()` 获取查询构造器，链式调用条件方法，最后调用终结方法执行：

```ts
const users = await userMapper.lambdaQuery()
  .select('userName', 'age')       // 指定查询列（可选）
  .eq('userName', '张三')           // WHERE user_name = ?
  .ge('age', 18)                   // AND age >= ?
  .like('email', '@gmail')         // AND email LIKE '%@gmail%'
  .isNotNull('email')              // AND email IS NOT NULL
  .orderByDesc('id')               // ORDER BY id DESC
  .page(1, 10)                     // LIMIT 10 OFFSET 0
  .list();                         // 执行查询，返回 User[]
```

### 全部条件方法

```ts
.eq('age', 18)              // age = 18
.ne('status', 0)            // status != 0
.gt('age', 18)              // age > 18
.ge('age', 18)              // age >= 18
.lt('age', 60)              // age < 60
.le('age', 60)              // age <= 60
.like('name', '张')          // name LIKE '%张%'
.likeLeft('name', '三')      // name LIKE '%三'
.likeRight('name', '张')     // name LIKE '张%'
.between('age', 18, 30)     // age BETWEEN 18 AND 30
.in('id', [1, 2, 3])        // id IN (1, 2, 3)
.notIn('id', [4, 5])        // id NOT IN (4, 5)
.isNull('email')            // email IS NULL
.isNotNull('email')         // email IS NOT NULL
```

### 终结方法

```ts
.list()                     // 执行查询，返回 T[]
.one()                      // 查询单条，返回 T | null
.count()                    // 查询数量，返回 number
.pageResult(page, size)     // 分页查询，返回 Page<T>
```

---

## 动态条件

所有条件方法都支持第一个参数传 `boolean`，为 `false` 时自动跳过：

```ts
function searchUsers(name?: string, minAge?: number, email?: string) {
  return userMapper.lambdaQuery()
    .eq(name != null, 'userName', name)       // name 为空时跳过
    .ge(minAge != null, 'age', minAge)        // minAge 为空时跳过
    .like(email != null, 'email', email)      // email 为空时跳过
    .list();
}

searchUsers('张三');           // → WHERE user_name = '张三'
searchUsers(undefined, 18);   // → WHERE age >= 18
searchUsers('张三', 18);      // → WHERE user_name = '张三' AND age >= 18
searchUsers();                // → SELECT * FROM sys_user（无条件）
```

Lambda 更新同样支持：

```ts
await userMapper.lambdaUpdate()
  .set(newAge != null, 'age', newAge)         // null 时不更新
  .set(newEmail != null, 'email', newEmail)   // null 时不更新
  .eq('id', 1)
  .execute();
```

---

## OR / AND 嵌套

```ts
// OR 嵌套
await userMapper.lambdaQuery()
  .ge('age', 18)
  .or(q => q.eq('userName', '张三').eq('userName', '李四'))
  .list();
// → WHERE age >= 18 AND (user_name = '张三' OR user_name = '李四')

// AND 嵌套
await userMapper.lambdaQuery()
  .or(q => q.eq('status', 1).eq('status', 2))
  .and(q => q.ge('age', 18).le('age', 60))
  .list();
// → WHERE (status = 1 OR status = 2) AND (age >= 18 AND age <= 60)
```

---

## Lambda 更新

```ts
await userMapper.lambdaUpdate()
  .set('age', 25)
  .set('email', 'new@test.com')
  .eq('userName', '张三')
  .execute();
// → UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE user_name = '张三'
```

`execute()` 返回影响行数。

---

## 分页查询

两种方式：

```ts
// 方式一：lambdaQuery 链式
const page = await userMapper.lambdaQuery()
  .ge('age', 18)
  .orderByAsc('age')
  .pageResult(1, 10);

// 方式二：BaseMapper 方法
const page = await userMapper.selectPage(1, 10,
  userMapper.lambdaQuery().ge('age', 18)
);
```

返回结构：

```ts
{
  records: User[],  // 当前页数据
  total: 100,       // 总记录数
  page: 1,          // 当前页码
  size: 10,         // 每页大小
  pages: 10,        // 总页数
}
```

---

## 自定义 SQL

使用 `#{param}` 命名参数，自动转为预编译占位符（MySQL `?`，PostgreSQL `$1`），防 SQL 注入：

```ts
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user WHERE age > #{age} AND user_name LIKE #{name}',
  { age: 18, name: '%张%' }
);
```

无参数时：

```ts
const rows = await userMapper.rawQuery('SELECT COUNT(*) AS total FROM sys_user');
```

---

## 事务管理

### 方式一：编程式事务（withTransaction）

基于 AsyncLocalStorage，作用域内所有 Mapper 操作自动使用同一个事务连接：

```ts
import { withTransaction } from 'node-mybatis-plus';

await withTransaction(ds, async () => {
  await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
  await userMapper.lambdaUpdate().set('age', 21).eq('userName', '张三').execute();
  // 正常结束 → 自动 COMMIT
  // 抛异常 → 自动 ROLLBACK
});
```

### 方式二：@Transactional 装饰器

先注册默认数据源：

```ts
import { setDefaultDataSource, Transactional } from 'node-mybatis-plus';

setDefaultDataSource(ds);

class UserService {
  @Transactional()
  async createUser(name: string, age: number) {
    await userMapper.insert({ userName: name, age, email: `${name}@test.com` });
    await logMapper.insert({ action: 'create', target: name });
    // 方法正常结束 → COMMIT
    // 抛异常 → ROLLBACK
  }
}
```

### 事务传播

嵌套的 `@Transactional` 方法自动复用外层事务连接：

```ts
class OrderService {
  @Transactional()
  async createOrder(userId: number) {
    await orderMapper.insert(order);
    await this.updateStock();  // 复用同一个事务
  }

  @Transactional()
  async updateStock() {
    // 单独调用 → 独立事务
    // 被 createOrder 调用 → 复用外层事务
    await stockMapper.lambdaUpdate().set('count', newCount).eq('id', 1).execute();
  }
}
```

### 低级 API：ds.transaction

需要手动使用事务连接：

```ts
await ds.transaction(async (tx) => {
  await tx.connection.query('INSERT INTO user (name) VALUES (?)', ['test']);
  await tx.connection.query('UPDATE account SET balance = balance - 100 WHERE id = ?', [1]);
});
```

> 推荐使用 `withTransaction` 或 `@Transactional`，它们通过 AsyncLocalStorage 自动传播事务连接，不需要手动传递。

---

## 多数据库切换

只需修改 `type` 字段，其余代码不变：

```ts
// MySQL
const ds = createDataSource({ type: 'mysql', host: 'localhost', port: 3306, database: 'mydb', username: 'root', password: '***' });

// PostgreSQL
const ds = createDataSource({ type: 'postgres', host: 'localhost', port: 5432, database: 'mydb', username: 'postgres', password: '***' });

// SQLite
const ds = createDataSource({ type: 'sqlite', database: './data.db' });
```

方言层自动处理的差异：

| 差异点 | MySQL | PostgreSQL | SQLite |
|--------|-------|------------|--------|
| 占位符 | `?` | `$1, $2, ...` | `?` |
| 标识符引用 | `` `col` `` | `"col"` | `"col"` |
| 自增 ID 返回 | `result.insertId` | `RETURNING id` | `result.lastInsertRowid` |

---

## 项目结构

```
src/
├── index.ts                  # 统一导出
├── types/index.ts            # 类型定义（SQL AST、接口）
├── decorator/index.ts        # @Table @Column @Id 装饰器
├── dialect/index.ts          # MySQL / PG / SQLite 方言
├── builder/sql-builder.ts    # SQL AST → SQL 字符串编译器
├── wrapper/
│   ├── abstract-wrapper.ts   # 条件构造器基类（16 种操作符）
│   ├── query-wrapper.ts      # LambdaQueryWrapper（查询）
│   └── update-wrapper.ts     # LambdaUpdateWrapper（更新）
├── mapper/base-mapper.ts     # BaseMapper 通用 CRUD
└── core/
    ├── datasource.ts         # 数据源（MySQL/PG/SQLite 连接池）
    └── transaction.ts        # 事务管理（AsyncLocalStorage + @Transactional）
```

数据流：

```
用户调用 → Wrapper 收集条件 → SqlBuilder 构建 AST → Dialect 生成 SQL → DataSource 执行
```
