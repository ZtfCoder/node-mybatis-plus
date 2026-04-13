# 装饰器 API

node-mybatis-plus 提供四个核心装饰器，用于实体映射和事务管理。

## @Table

类装饰器，指定实体类对应的数据库表名。

### 签名

```ts
function Table(tableName: string): ClassDecorator
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tableName` | `string` | 是 | 数据库表名 |

### 示例

```ts
import { Table } from 'node-mybatis-plus'

@Table('sys_user')
class User {
  id!: number
  userName!: string
  email!: string
}
```

## @Column

属性装饰器，将属性映射到数据库列。**所有需要参与 SQL 操作的属性都必须添加此装饰器**，未添加的属性会被框架忽略。不传参数时，属性名自动按 camelCase → snake_case 规则转换为列名。

### 签名

```ts
function Column(nameOrOptions?: string | ColumnOptions): PropertyDecorator
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nameOrOptions` | `string \| ColumnOptions` | 否 | 列名字符串或配置对象 |

### ColumnOptions

```ts
interface ColumnOptions {
  name?: string    // 自定义列名
  exist?: boolean  // 是否为数据库字段，默认 true
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | 自动转换 | 自定义数据库列名 |
| `exist` | `boolean` | `true` | 设为 `false` 表示该属性不映射到数据库列 |

### 示例

```ts
import { Table, Column } from 'node-mybatis-plus'

@Table('sys_user')
class User {
  id!: number

  // 自定义列名
  @Column('user_name')
  userName!: string

  // 使用配置对象
  @Column({ name: 'email_addr' })
  email!: string

  // 非数据库字段，查询和插入时忽略
  @Column({ exist: false })
  fullName!: string
}
```

## @Id

属性装饰器，标记主键字段并指定主键生成策略。

### 签名

```ts
function Id(options?: IdOptions): PropertyDecorator
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `IdOptions` | 否 | 主键配置选项 |

### IdOptions

```ts
interface IdOptions {
  type?: 'auto' | 'uuid' | 'snowflake' | 'input'
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `'auto' \| 'uuid' \| 'snowflake' \| 'input'` | `'auto'` | 主键生成策略：`auto` 数据库自增，`uuid` 自动生成 UUID，`snowflake` 雪花算法生成分布式唯一 ID，`input` 手动赋值 |

### 示例

```ts
import { Table, Column, Id } from 'node-mybatis-plus'

@Table('sys_user')
class User {
  // 数据库自增主键（默认）
  @Id()
  id!: number

  @Column()
  userName!: string
}

@Table('sys_order')
class Order {
  // UUID 主键
  @Id({ type: 'uuid' })
  id!: string

  @Column()
  amount!: number
}

@Table('sys_config')
class Config {
  // 手动赋值主键
  @Id({ type: 'input' })
  key!: string

  @Column()
  value!: string
}
```

## @Transactional

方法装饰器，声明式事务管理。被装饰的方法将自动在事务中执行，方法抛出异常时自动回滚。基于 AsyncLocalStorage 实现事务传播，同一事务上下文中的所有数据库操作共享同一连接。

### 签名

```ts
function Transactional(options?: TransactionalOptions): MethodDecorator
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `TransactionalOptions` | 否 | 事务配置选项 |

### TransactionalOptions

```ts
interface TransactionalOptions {
  datasource?: DataSource
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `datasource` | `DataSource` | 全局默认数据源 | 指定事务使用的数据源，不传则使用 `setDefaultDataSource` 设置的默认数据源 |

### 示例

```ts
import { Transactional, setDefaultDataSource, createDataSource } from 'node-mybatis-plus'

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  database: 'mydb',
  username: 'root',
  password: '123456',
})

setDefaultDataSource(ds)

class UserService {
  // 使用默认数据源
  @Transactional()
  async createUser(user: User) {
    await userMapper.insert(user)
    await logMapper.insert({ action: 'create', userId: user.id })
    // 任一操作失败，全部回滚
  }

  // 指定数据源
  @Transactional({ datasource: ds })
  async transferBalance(fromId: number, toId: number, amount: number) {
    await accountMapper.updateById({ id: fromId, balance: -amount })
    await accountMapper.updateById({ id: toId, balance: amount })
  }
}
```

## @LogicDelete

属性装饰器，标记逻辑删除字段。配合 `createLogicDeletePlugin` 使用，自动将 DELETE 改写为 UPDATE，SELECT/UPDATE 自动追加未删除条件。

### 签名

```ts
function LogicDelete(options?: LogicDeleteOptions): PropertyDecorator
```

### LogicDeleteOptions

```ts
interface LogicDeleteOptions {
  deleteValue?: any;     // 已删除的值，默认 1
  notDeleteValue?: any;  // 未删除的值，默认 0
  name?: string;         // 数据库列名，不传则自动 camelCase → snake_case
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `deleteValue` | `any` | `1` | 标记为已删除时写入的值 |
| `notDeleteValue` | `any` | `0` | 未删除时的值，查询时自动追加此条件 |
| `name` | `string` | 自动转换 | 自定义数据库列名 |

### 示例

```ts
import { Table, Column, Id, LogicDelete } from 'node-mybatis-plus'

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number

  @Column()
  userName!: string

  @LogicDelete()
  deleted!: number  // 默认：0 未删除，1 已删除

  // 自定义删除值
  @LogicDelete({ deleteValue: 'Y', notDeleteValue: 'N' })
  deletedFlag!: string
}
```

## @TableField

`@Column` 的别名，兼容 MyBatis-Plus 风格的命名习惯，功能与 `@Column` 完全相同。

### 签名

```ts
function TableField(nameOrOptions?: string | ColumnOptions): PropertyDecorator
```

### 示例

```ts
import { Table, Id, TableField } from 'node-mybatis-plus'

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number

  @TableField('user_name')
  userName!: string

  @TableField({ fill: 'insert' })
  createTime!: Date

  @TableField({ fill: 'insertAndUpdate' })
  updateTime!: Date

  @TableField({ exist: false })
  fullName!: string  // 非数据库字段
}
```

详见 [@Column](#column) 的完整选项说明。
