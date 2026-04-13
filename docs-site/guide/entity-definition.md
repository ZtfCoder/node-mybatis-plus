# 实体定义

node-mybatis-plus 使用装饰器将 TypeScript 类映射到数据库表。三个核心装饰器：`@Table`、`@Column`、`@Id`。

## @Table 装饰器

`@Table(tableName)` 用于指定类对应的数据库表名，必须放在 class 上：

```ts
import { Table } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  // ...
}
```

```ts
@Table('t_order')
class Order {
  // ...
}
```

::: warning
每个实体类必须使用 `@Table` 装饰器，否则在使用 Mapper 时会抛出错误：`No entity metadata found for ClassName. Did you forget @Table?`
:::

## @Column 装饰器

`@Column` 用于标记数据库列，支持三种用法：

### 自动转换列名

不传参数时，自动将 camelCase 属性名转为 snake_case 列名：

```ts
@Table('sys_user')
class User {
  @Column()
  userName!: string;   // → 列名: user_name

  @Column()
  age!: number;        // → 列名: age

  @Column()
  createTime!: Date;   // → 列名: create_time
}
```

### 显式指定列名

传入字符串参数，直接指定数据库列名：

```ts
@Table('sys_user')
class User {
  @Column('user_name')
  userName!: string;   // → 列名: user_name

  @Column('email_addr')
  email!: string;      // → 列名: email_addr
}
```

### 标记非数据库字段

通过 `exist: false` 选项标记该属性不对应数据库列，查询和插入时会自动忽略：

```ts
@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ exist: false })
  fullName!: string;   // 非数据库字段，不参与 SQL 操作
}
```

::: tip
`exist: false` 适用于计算属性、前端展示字段等不需要持久化的属性。
:::

### 完整选项

`@Column` 接受字符串或选项对象：

```ts
// 字符串形式
@Column('user_name')

// 选项对象形式
@Column({ name: 'user_name', exist: true })

// 标记非数据库字段
@Column({ exist: false })
```

选项对象的类型定义：

```ts
interface ColumnOptions {
  name?: string;      // 数据库列名，不传则自动 camelCase → snake_case
  exist?: boolean;    // 是否为数据库字段，默认 true
}
```

## @Id 装饰器

`@Id` 用于标记主键字段，支持配置主键生成策略：

### 自增主键

```ts
@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column()
  userName!: string;
}
```

`type: 'auto'` 表示数据库自增主键，insert 时不需要传入 id 值，插入后自动返回生成的 ID。

### UUID 主键

```ts
@Table('sys_log')
class Log {
  @Id({ type: 'uuid' })
  id!: string;

  @Column()
  action!: string;
}
```

`type: 'uuid'` 表示使用 UUID 作为主键，insert 时自动生成 UUID 值。

### 手动赋值主键

```ts
@Table('sys_config')
class Config {
  @Id({ type: 'input' })
  key!: string;

  @Column()
  value!: string;
}
```

`type: 'input'` 表示主键由用户手动赋值，insert 时必须传入主键值。

### 主键选项

```ts
interface IdOptions {
  type?: 'auto' | 'uuid' | 'input';  // 默认 'auto'
}
```

| type | 说明 | insert 行为 |
|------|------|-------------|
| `auto` | 数据库自增 | 不传 id，返回自增值 |
| `uuid` | UUID 生成 | 自动生成 UUID |
| `input` | 手动赋值 | 必须传入 id 值 |

## 完整示例

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

  @Column()
  createTime!: Date;

  @Column({ exist: false })
  displayName!: string;  // 非数据库字段
}
```

对应的数据库表结构：

```sql
CREATE TABLE sys_user (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name   VARCHAR(50),
  age         INTEGER,
  email       VARCHAR(100),
  create_time DATETIME
);
```

::: tip camelCase → snake_case 转换规则
属性名中的每个大写字母会被转换为 `_` + 小写字母：
- `userName` → `user_name`
- `createTime` → `create_time`
- `age` → `age`（无大写字母，保持不变）
:::
