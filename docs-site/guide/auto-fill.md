# 自动填充

自动填充用于在 INSERT 或 UPDATE 时自动填充某些字段，如创建时间、更新时间、操作人等，无需在业务代码中手动赋值。

## 快速开始

### 1. 定义实体

在需要自动填充的字段上使用 `@Column({ fill: '...' })` 或 `@TableField({ fill: '...' })`：

```ts
import { Table, Column, Id } from 'node-mybatis-plus';

@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id!: number;

  @Column()
  userName!: string;

  @Column({ fill: 'insert' })          // 仅插入时填充
  createTime!: Date;

  @Column({ fill: 'insertAndUpdate' }) // 插入和更新时都填充
  updateTime!: Date;

  @Column({ fill: 'insert' })
  createBy!: string;

  @Column({ fill: 'update' })          // 仅更新时填充
  updateBy!: string;
}
```

### 2. 注册插件

```ts
import { createDataSource, createAutoFillPlugin } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  database: 'test',
  username: 'root',
  password: '******',
  plugins: [
    createAutoFillPlugin({
      handler: (field, strategy) => {
        const now = new Date();
        switch (field) {
          case 'createTime': return now;
          case 'updateTime': return now;
          case 'createBy':   return getCurrentUserId();
          case 'updateBy':   return getCurrentUserId();
        }
      },
    }),
  ],
});
```

### 3. 正常使用

注册插件后，无需手动传入填充字段：

```ts
// INSERT 时自动填充 createTime、updateTime、createBy
await userMapper.insert({ userName: '张三', age: 20 });

// UPDATE 时自动填充 updateTime、updateBy
await userMapper.updateById({ id: 1, age: 21 });
```

## fill 填充策略

| 策略 | 触发时机 |
|------|----------|
| `'insert'` | 仅 INSERT 时填充 |
| `'update'` | 仅 UPDATE 时填充 |
| `'insertAndUpdate'` | INSERT 和 UPDATE 时都填充 |

## handler 填充处理器

`handler` 是一个函数，接收字段名和填充策略，返回要填充的值。返回 `undefined` 表示跳过该字段。

```ts
type FillHandler = (fieldName: string, strategy: FillStrategy) => any;
```

```ts
createAutoFillPlugin({
  handler: (field, strategy) => {
    // 根据字段名决定填充值
    if (field === 'createTime' || field === 'updateTime') {
      return new Date();
    }
    // 根据策略决定填充值
    if (strategy === 'insert' && field === 'createBy') {
      return getCurrentUser().id;
    }
    // 返回 undefined 跳过该字段
  },
})
```

## 与 @TableField 的关系

`@TableField` 是 `@Column` 的别名，两者完全等价，可以混用：

```ts
@Column({ fill: 'insert' })
createTime!: Date;

// 等价于
@TableField({ fill: 'insert' })
createTime!: Date;
```

::: tip
`@TableField` 是为了兼容 MyBatis-Plus 风格的命名习惯，功能与 `@Column` 完全相同。
:::

## 下一步

- [逻辑删除](/guide/logic-delete) — 软删除数据
- [多租户](/guide/multi-tenant) — 自动追加租户隔离条件
