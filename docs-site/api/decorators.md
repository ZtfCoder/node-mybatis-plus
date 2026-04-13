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

属性装饰器，自定义列名或标记非数据库字段。若不使用该装饰器，属性名会自动按 camelCase → snake_case 规则转换为列名。

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
  type?: 'auto' | 'uuid' | 'input'
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `'auto' \| 'uuid' \| 'input'` | `'auto'` | 主键生成策略：`auto` 数据库自增，`uuid` 自动生成 UUID，`input` 手动赋值 |

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
