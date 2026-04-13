# BaseMapper CRUD

`BaseMapper` 是 node-mybatis-plus 的核心类，内置了完整的 CRUD 方法。只需继承它，即可获得开箱即用的数据库操作能力。

## 创建 Mapper

```ts
import { BaseMapper } from 'node-mybatis-plus';

class UserMapper extends BaseMapper<User> {}
const userMapper = new UserMapper(User, ds);
```

::: tip
每个 Mapper 绑定一个实体类和一个数据源。实体类通过装饰器定义表映射关系，详见 [实体定义](/guide/entity-definition)。
:::

## 新增

### insert — 单条新增

插入一条记录，返回自增主键 ID：

```ts
const id = await userMapper.insert({
  userName: '张三',
  age: 20,
  email: 'zhangsan@test.com',
});
console.log('新增用户 ID:', id); // → 1
```

::: tip
`@Id({ type: 'auto' })` 标记的主键字段会自动跳过，由数据库生成。
:::

### insertBatch — 批量新增

一次插入多条记录，返回影响行数：

```ts
const affected = await userMapper.insertBatch([
  { userName: '李四', age: 25, email: 'lisi@test.com' },
  { userName: '王五', age: 30, email: 'wangwu@test.com' },
]);
console.log('插入行数:', affected); // → 2
```

## 查询

### selectById — 按 ID 查询

```ts
const user = await userMapper.selectById(1);
// → { id: 1, userName: '张三', age: 20, email: 'zhangsan@test.com' }
```

返回 `T | null`，未找到时返回 `null`。

### selectBatchIds — 批量 ID 查询

```ts
const users = await userMapper.selectBatchIds([1, 2, 3]);
// → [{ id: 1, ... }, { id: 2, ... }, { id: 3, ... }]
```

### selectList — 查询列表

```ts
// 查询全部
const allUsers = await userMapper.selectList();

// 带条件查询
const wrapper = userMapper.lambdaQuery().ge('age', 18);
const adults = await userMapper.selectList(wrapper);
```

### selectOne — 查询单条

```ts
const wrapper = userMapper.lambdaQuery().eq('userName', '张三');
const user = await userMapper.selectOne(wrapper);
// → { id: 1, userName: '张三', ... } 或 null
```

### selectCount — 查询数量

```ts
// 查询全部数量
const total = await userMapper.selectCount();

// 带条件查询数量
const wrapper = userMapper.lambdaQuery().ge('age', 18);
const adultCount = await userMapper.selectCount(wrapper);
```

### selectPage — 分页查询

```ts
const page = await userMapper.selectPage(1, 10);
// → { records: [...], total: 100, page: 1, size: 10, pages: 10 }

// 带条件分页
const wrapper = userMapper.lambdaQuery().ge('age', 18).orderByAsc('age');
const adultPage = await userMapper.selectPage(1, 10, wrapper);
```

## 修改

### updateById — 按 ID 更新

只更新实体中**非 `undefined`** 的字段，未赋值的字段不会被覆盖：

```ts
// 只更新 age 字段，其他字段保持不变
await userMapper.updateById({ id: 1, age: 21 });
```

::: warning
实体必须包含主键值，否则会抛出错误。`null` 值会被更新到数据库，`undefined` 值会被跳过。
:::

### update — 条件更新

通过 Wrapper 指定更新条件：

```ts
const wrapper = userMapper.lambdaQuery().eq('userName', '张三');
await userMapper.update({ age: 25, email: 'new@test.com' }, wrapper);
// → UPDATE sys_user SET age = 25, email = 'new@test.com' WHERE user_name = '张三'
```

## 删除

### deleteById — 按 ID 删除

```ts
await userMapper.deleteById(1);
```

### deleteBatchIds — 批量删除

```ts
await userMapper.deleteBatchIds([2, 3, 4]);
```

### delete — 条件删除

通过 Wrapper 指定删除条件：

```ts
const wrapper = userMapper.lambdaQuery().lt('age', 18);
await userMapper.delete(wrapper);
// → DELETE FROM sys_user WHERE age < 18
```

::: danger
条件删除请务必确认 Wrapper 条件正确，避免误删数据。
:::

## 方法总览

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `insert(entity)` | 单条新增 | `Promise<number>` 自增 ID |
| `insertBatch(entities)` | 批量新增 | `Promise<number>` 影响行数 |
| `selectById(id)` | 按 ID 查询 | `Promise<T \| null>` |
| `selectBatchIds(ids)` | 批量 ID 查询 | `Promise<T[]>` |
| `selectList(wrapper?)` | 查询列表 | `Promise<T[]>` |
| `selectOne(wrapper)` | 查询单条 | `Promise<T \| null>` |
| `selectCount(wrapper?)` | 查询数量 | `Promise<number>` |
| `selectPage(page, size, wrapper?)` | 分页查询 | `Promise<Page<T>>` |
| `updateById(entity)` | 按 ID 更新 | `Promise<number>` 影响行数 |
| `update(entity, wrapper)` | 条件更新 | `Promise<number>` 影响行数 |
| `deleteById(id)` | 按 ID 删除 | `Promise<number>` 影响行数 |
| `deleteBatchIds(ids)` | 批量删除 | `Promise<number>` 影响行数 |
| `delete(wrapper)` | 条件删除 | `Promise<number>` 影响行数 |

## 下一步

- [Lambda 链式查询](/guide/lambda-query) — 更灵活的条件构造方式
- [分页查询](/guide/pagination) — 分页查询详解
