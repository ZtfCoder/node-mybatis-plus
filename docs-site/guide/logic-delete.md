# 逻辑删除

逻辑删除是指不真正删除数据库记录，而是通过一个标记字段（如 `deleted`）来标识数据是否已被删除。node-mybatis-plus 通过 `@LogicDelete` 装饰器 + `createLogicDeletePlugin` 插件实现。

## 快速开始

### 1. 定义实体

在需要逻辑删除的字段上添加 `@LogicDelete` 装饰器：

```ts
import { Table, Column, Id, LogicDelete } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column()
  userName!: string;

  @Column()
  age!: number;

  @LogicDelete()
  deleted!: number;  // 0: 未删除，1: 已删除
}
```

### 2. 注册插件

```ts
import { createDataSource, createLogicDeletePlugin } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  database: 'test',
  username: 'root',
  password: '******',
  plugins: [
    createLogicDeletePlugin(),
  ],
});
```

### 3. 正常使用 CRUD

注册插件后，所有 CRUD 操作自动处理逻辑删除，无需修改业务代码：

```ts
// DELETE → 自动改写为 UPDATE SET deleted = 1
await userMapper.deleteById(1);
// 实际执行：UPDATE `sys_user` SET `deleted` = 1 WHERE `id` = 1 AND `deleted` = 0

// SELECT → 自动追加 WHERE deleted = 0
const users = await userMapper.selectList();
// 实际执行：SELECT * FROM `sys_user` WHERE `deleted` = 0

// UPDATE → 自动追加 AND deleted = 0，防止误更新已删除数据
await userMapper.updateById({ id: 1, age: 25 });
// 实际执行：UPDATE `sys_user` SET `age` = 25 WHERE `id` = 1 AND `deleted` = 0
```

## @LogicDelete 选项

```ts
@LogicDelete(options?: LogicDeleteOptions)
```

```ts
interface LogicDeleteOptions {
  deleteValue?: any;     // 已删除的值，默认 1
  notDeleteValue?: any;  // 未删除的值，默认 0
  name?: string;         // 数据库列名，不传则自动 camelCase → snake_case
}
```

### 自定义删除值

```ts
// 使用布尔值
@LogicDelete({ deleteValue: true, notDeleteValue: false })
isDeleted!: boolean;

// 使用字符串
@LogicDelete({ deleteValue: 'Y', notDeleteValue: 'N' })
deletedFlag!: string;

// 使用时间戳（删除时间，未删除为 null）
@LogicDelete({ deleteValue: () => new Date(), notDeleteValue: null })
deletedAt!: Date | null;
```

## 插件行为说明

| 操作 | 原始 SQL | 改写后 SQL |
|------|----------|------------|
| `deleteById(1)` | `DELETE FROM t WHERE id = ?` | `UPDATE t SET deleted = 1 WHERE (id = ?) AND deleted = 0` |
| `selectList()` | `SELECT * FROM t` | `SELECT * FROM t WHERE deleted = 0` |
| `selectList(wrapper)` | `SELECT * FROM t WHERE age >= ?` | `SELECT * FROM t WHERE deleted = 0 AND age >= ?` |
| `updateById(entity)` | `UPDATE t SET age = ? WHERE id = ?` | `UPDATE t SET age = ? WHERE id = ? AND deleted = 0` |

::: warning
逻辑删除插件通过 SQL 改写实现，`rawQuery` 执行的自定义 SQL 不会自动追加逻辑删除条件，需要手动处理。
:::

## 下一步

- [自动填充](/guide/auto-fill) — 自动填充创建时间、更新时间等字段
- [多租户](/guide/multi-tenant) — 自动追加租户隔离条件
