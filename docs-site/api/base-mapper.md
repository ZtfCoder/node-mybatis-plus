# BaseMapper

`BaseMapper<T>` 是通用数据访问基类，提供完整的 CRUD 操作。通过传入实体类和数据源即可获得开箱即用的数据库操作能力。

## 构造函数

```ts
class BaseMapper<T extends object> {
  constructor(entityClass: Function, datasource: DataSource)
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `entityClass` | `Function` | 使用 `@Table` 装饰的实体类 |
| `datasource` | `DataSource` | 数据源实例 |

## 方法一览

| 方法 | 签名 | 返回值 | 说明 |
|------|------|--------|------|
| `insert` | `insert(entity: Partial<T>)` | `Promise<number>` | 插入单条记录，返回自增 ID |
| `insertBatch` | `insertBatch(entities: Partial<T>[])` | `Promise<number>` | 批量插入，返回影响行数 |
| `selectById` | `selectById(id: any)` | `Promise<T \| null>` | 根据主键查询单条记录 |
| `selectBatchIds` | `selectBatchIds(ids: any[])` | `Promise<T[]>` | 根据主键批量查询 |
| `selectList` | `selectList(wrapper?: LambdaQueryWrapper<T>)` | `Promise<T[]>` | 条件查询列表 |
| `selectOne` | `selectOne(wrapper: LambdaQueryWrapper<T>)` | `Promise<T \| null>` | 条件查询单条记录 |
| `selectCount` | `selectCount(wrapper?: LambdaQueryWrapper<T>)` | `Promise<number>` | 条件查询总数 |
| `selectPage` | `selectPage(page: number, size: number, wrapper?: LambdaQueryWrapper<T>)` | `Promise<Page<T>>` | 分页查询 |
| `updateById` | `updateById(entity: Partial<T>)` | `Promise<number>` | 根据主键更新，返回影响行数 |
| `update` | `update(entity: Partial<T>, wrapper: LambdaQueryWrapper<T>)` | `Promise<number>` | 条件更新，返回影响行数 |
| `deleteById` | `deleteById(id: any)` | `Promise<number>` | 根据主键删除，返回影响行数 |
| `deleteBatchIds` | `deleteBatchIds(ids: any[])` | `Promise<number>` | 根据主键批量删除，返回影响行数 |
| `delete` | `delete(wrapper: LambdaQueryWrapper<T>)` | `Promise<number>` | 条件删除，返回影响行数 |
| `lambdaQuery` | `lambdaQuery()` | `LambdaQueryWrapper<T>` | 创建 Lambda 链式查询构造器 |
| `lambdaUpdate` | `lambdaUpdate()` | `LambdaUpdateWrapper<T>` | 创建 Lambda 链式更新构造器 |
| `rawQuery` | `rawQuery(sql: string, params?: Record<string, any>)` | `Promise<any>` | 执行自定义 SQL |

## 方法详情

### insert

插入单条记录。自增主键（`@Id({ type: 'auto' })`）字段会自动跳过，由数据库生成。

```ts
const id = await userMapper.insert({
  userName: '张三',
  email: 'zhangsan@example.com',
  age: 25,
})
// id = 新插入记录的自增 ID
```

### insertBatch

批量插入多条记录，生成单条 INSERT 语句。

```ts
const affected = await userMapper.insertBatch([
  { userName: '张三', email: 'a@example.com' },
  { userName: '李四', email: 'b@example.com' },
])
// affected = 2
```

### selectById

根据主键查询单条记录，未找到返回 `null`。

```ts
const user = await userMapper.selectById(1)
// user: User | null
```

### selectBatchIds

根据主键数组批量查询，传入空数组返回空列表。

```ts
const users = await userMapper.selectBatchIds([1, 2, 3])
// users: User[]
```

### selectList

使用条件构造器查询列表。不传参数时查询全部记录。

```ts
// 查询全部
const all = await userMapper.selectList()

// 条件查询
const wrapper = userMapper.lambdaQuery().eq('status', 1)
const activeUsers = await userMapper.selectList(wrapper)
```

### selectOne

条件查询单条记录，内部自动添加 `LIMIT 1`。

```ts
const wrapper = userMapper.lambdaQuery().eq('email', 'test@example.com')
const user = await userMapper.selectOne(wrapper)
```

### selectCount

条件查询记录总数。不传参数时统计全部记录。

```ts
const total = await userMapper.selectCount()
const activeCount = await userMapper.selectCount(
  userMapper.lambdaQuery().eq('status', 1)
)
```

### selectPage

分页查询，返回 `Page<T>` 对象。

```ts
const page = await userMapper.selectPage(1, 10)
// page.records  — 当前页数据
// page.total    — 总记录数
// page.pages    — 总页数
```

### updateById

根据实体中的主键值更新非空字段。实体必须包含主键值。

```ts
const affected = await userMapper.updateById({
  id: 1,
  userName: '新名字',
  email: 'new@example.com',
})
```

### update

使用条件构造器指定 WHERE 条件进行更新。

```ts
const wrapper = userMapper.lambdaQuery().eq('status', 0)
const affected = await userMapper.update({ status: 1 }, wrapper)
```

### deleteById

根据主键删除单条记录。

```ts
const affected = await userMapper.deleteById(1)
```

### deleteBatchIds

根据主键数组批量删除。

```ts
const affected = await userMapper.deleteBatchIds([1, 2, 3])
```

### delete

使用条件构造器指定 WHERE 条件进行删除。

```ts
const wrapper = userMapper.lambdaQuery().eq('status', 0)
const affected = await userMapper.delete(wrapper)
```

### lambdaQuery

创建 Lambda 链式查询构造器，已自动绑定数据源。

```ts
const users = await userMapper.lambdaQuery()
  .eq('status', 1)
  .like('userName', '张')
  .orderByDesc('createTime')
  .list()
```

### lambdaUpdate

创建 Lambda 链式更新构造器，已自动绑定数据源。

```ts
const affected = await userMapper.lambdaUpdate()
  .set('status', 0)
  .eq('lastLoginTime', null)
  .execute()
```

### rawQuery

执行自定义 SQL，支持 `#{param}` 命名参数语法，自动转换为参数化查询防止 SQL 注入。

```ts
const users = await userMapper.rawQuery(
  'SELECT * FROM sys_user WHERE age > #{minAge} AND status = #{status}',
  { minAge: 18, status: 1 }
)
```
