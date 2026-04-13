# 快速开始

## 安装

```bash
npm install node-mybatis-plus reflect-metadata
```

按需安装数据库驱动（至少装一个）：

```bash
# MySQL
npm install mysql2

# PostgreSQL
npm install pg

# SQLite
npm install better-sqlite3
```

## 定义实体

使用装饰器将 TypeScript 类映射到数据库表：

```ts
import 'reflect-metadata';
import { Table, Column, Id } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column('user_name')
  userName!: string;

  @Column()
  age!: number;

  @Column()
  email!: string;
}
```

::: tip
在项目入口文件顶部引入 `reflect-metadata`，确保装饰器元数据正常工作。
:::

## 创建数据源和 Mapper

```ts
import { createDataSource, BaseMapper } from 'node-mybatis-plus';

// 创建数据源
const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'test',
  username: 'root',
  password: '******',
});

// 创建 Mapper
class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);
```

::: tip
如果只是想快速体验，可以使用 SQLite 内存数据库，无需安装外部数据库：

```ts
const ds = createDataSource({
  type: 'sqlite',
  database: ':memory:',
});
```
:::

## 基本 CRUD

### 新增

```ts
// 单条新增，返回自增 ID
const id = await userMapper.insert({
  userName: '张三',
  age: 20,
  email: 'zhangsan@test.com',
});

// 批量新增
await userMapper.insertBatch([
  { userName: '李四', age: 25, email: 'lisi@test.com' },
  { userName: '王五', age: 30, email: 'wangwu@test.com' },
]);
```

### 查询

```ts
// 按 ID 查询
const user = await userMapper.selectById(1);

// 查询全部
const users = await userMapper.selectList();

// 查询数量
const count = await userMapper.selectCount();

// 分页查询
const page = await userMapper.selectPage(1, 10);
// → { records: [...], total: 100, page: 1, size: 10, pages: 10 }
```

### 修改

```ts
// 按 ID 更新（只更新非 undefined 字段）
await userMapper.updateById({ id: 1, age: 21 });
```

### 删除

```ts
// 按 ID 删除
await userMapper.deleteById(1);

// 批量删除
await userMapper.deleteBatchIds([2, 3]);
```

## 链式查询预览

node-mybatis-plus 最强大的能力是 Lambda 链式查询：

```ts
const users = await userMapper.lambdaQuery()
  .eq('userName', '张三')
  .ge('age', 18)
  .like('email', '@gmail')
  .orderByDesc('id')
  .list();
```

支持动态条件 — 参数为空时自动跳过：

```ts
function searchUsers(name?: string, minAge?: number) {
  return userMapper.lambdaQuery()
    .eq(name != null, 'userName', name)
    .ge(minAge != null, 'age', minAge)
    .list();
}
```

## 完整示例

以下是一个使用 SQLite 内存数据库的完整可运行示例：

```ts
import 'reflect-metadata';
import { Table, Column, Id, createDataSource, BaseMapper } from 'node-mybatis-plus';

// 1. 定义实体
@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column('user_name')
  userName!: string;

  @Column()
  age!: number;

  @Column()
  email!: string;
}

// 2. 创建数据源
const ds = createDataSource({
  type: 'sqlite',
  database: ':memory:',
});

// 3. 创建 Mapper
class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);

async function main() {
  // 建表
  await ds.execute(`
    CREATE TABLE sys_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT,
      age INTEGER,
      email TEXT
    )
  `, []);

  // 新增
  const id = await userMapper.insert({
    userName: '张三',
    age: 20,
    email: 'zhangsan@test.com',
  });
  console.log('新增用户 ID:', id);

  // 查询
  const user = await userMapper.selectById(id);
  console.log('查询结果:', user);

  // Lambda 链式查询
  const users = await userMapper.lambdaQuery()
    .ge('age', 18)
    .orderByAsc('age')
    .list();
  console.log('查询列表:', users);

  // 关闭数据源
  await ds.close();
}

main();
```

## 下一步

- [实体定义](/guide/entity-definition) — 深入了解 `@Table`、`@Column`、`@Id` 装饰器
- [数据源配置](/guide/datasource) — MySQL / PostgreSQL / SQLite 配置详解
