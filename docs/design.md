# node-mybatis-plus 设计方案

## 1. 项目定位

用 Node.js/TypeScript 实现类似 Java MyBatis-Plus 的 ORM 库。

核心特性：
- Lambda 链式查询（类型安全的条件构造器）
- 动态 SQL（条件拼接、模板解析）
- 自定义 SQL（原生 SQL + 参数绑定）
- 内置 CRUD 通用方法
- 多数据库支持（MySQL / PostgreSQL / SQLite）

## 2. 项目结构

```
node-mybatis-plus/
├── src/
│   ├── index.ts                  # 统一导出
│   ├── core/
│   │   ├── datasource.ts         # 数据源管理（连接池）
│   │   ├── executor.ts           # SQL 执行器
│   │   └── transaction.ts        # 事务管理
│   ├── dialect/
│   │   ├── dialect.ts            # 方言抽象接口
│   │   ├── mysql-dialect.ts      # MySQL 方言
│   │   ├── pg-dialect.ts         # PostgreSQL 方言
│   │   └── sqlite-dialect.ts     # SQLite 方言
│   ├── wrapper/
│   │   ├── abstract-wrapper.ts   # 条件构造器基类
│   │   ├── query-wrapper.ts      # 查询条件构造器
│   │   ├── update-wrapper.ts     # 更新条件构造器
│   │   └── lambda-wrapper.ts     # Lambda 链式封装
│   ├── mapper/
│   │   ├── base-mapper.ts        # 通用 CRUD Mapper
│   │   └── custom-sql.ts         # 自定义 SQL 支持
│   ├── builder/
│   │   ├── sql-builder.ts        # SQL 拼接
│   │   └── dynamic-sql.ts        # 动态 SQL 模板解析
│   ├── decorator/
│   │   ├── table.ts              # @Table 装饰器
│   │   ├── column.ts             # @Column 装饰器
│   │   └── id.ts                 # @Id 主键装饰器
│   ├── plugin/
│   │   ├── plugin.ts             # 插件接口
│   │   ├── pagination.ts         # 分页插件
│   │   └── soft-delete.ts        # 软删除插件
│   └── types/
│       └── index.ts              # 类型定义
├── docs/
│   ├── design.md                 # 设计方案（本文件）
│   └── technical.md              # 技术方案
├── package.json
├── tsconfig.json
└── README.md
```

## 3. 实体定义

通过装饰器定义实体与数据库表的映射关系：

```ts
@Table('sys_user')
class User {
  @Id({ type: 'auto' })
  id: number;

  @Column('user_name')
  userName: string;

  @Column()
  age: number;

  @Column()
  email: string;

  @Column({ exist: false })  // 非数据库字段
  fullName: string;
}
```

## 4. Lambda 链式查询

### 4.1 基本用法

```ts
const users = await userMapper.lambdaQuery()
  .select('userName', 'age')
  .eq('userName', '张三')
  .ge('age', 18)
  .like('email', '@gmail')
  .orderByAsc('age')
  .page(1, 10)
  .list();
```

### 4.2 类型安全

通过 TypeScript 泛型 `keyof T` 约束字段名，IDE 自动补全：

```ts
// ✅ 编译通过
wrapper.eq('userName', '张三');

// ❌ 编译报错：'xxx' is not assignable to keyof User
wrapper.eq('xxx', '张三');
```

### 4.3 支持的操作符

| 方法 | SQL | 说明 |
|------|-----|------|
| eq | = | 等于 |
| ne | != | 不等于 |
| gt | > | 大于 |
| ge | >= | 大于等于 |
| lt | < | 小于 |
| le | <= | 小于等于 |
| like | LIKE '%val%' | 模糊匹配 |
| likeLeft | LIKE '%val' | 左模糊 |
| likeRight | LIKE 'val%' | 右模糊 |
| between | BETWEEN a AND b | 区间 |
| in | IN (a, b, c) | 包含 |
| notIn | NOT IN | 不包含 |
| isNull | IS NULL | 为空 |
| isNotNull | IS NOT NULL | 不为空 |
| orderByAsc | ORDER BY col ASC | 升序 |
| orderByDesc | ORDER BY col DESC | 降序 |
| groupBy | GROUP BY | 分组 |
| having | HAVING | 分组过滤 |

### 4.4 动态条件

第一个参数传 boolean，为 false 时自动跳过该条件：

```ts
const wrapper = lambdaQuery<User>()
  .eq(userName != null, 'userName', userName)
  .ge(age != null, 'age', age)
  .like(email != null, 'email', email);
```

## 5. 动态 SQL 模板

支持类 MyBatis XML 风格的动态 SQL：

```ts
const users = await userMapper.dynamicQuery(`
  SELECT * FROM user
  <where>
    <if test="userName != null">
      AND user_name = #{userName}
    </if>
    <if test="age != null">
      AND age >= #{age}
    </if>
  </where>
  <if test="orderBy != null">
    ORDER BY ${orderBy}
  </if>
`, { userName: '张三', age: 18 });
```

支持的标签：`<if>` `<where>` `<set>` `<foreach>` `<choose>/<when>/<otherwise>`

## 6. 自定义 SQL

```ts
// 原生 SQL
const users = await userMapper.rawQuery(
  'SELECT * FROM user WHERE age > #{age}',
  { age: 18 }
);

// 自定义 SQL + Wrapper 混合
const wrapper = lambdaQuery<User>().ge('age', 18);
const users = await userMapper.rawQuery(
  'SELECT * FROM user ${ew.customSqlSegment}',
  { ew: wrapper }
);
```

## 7. BaseMapper 通用 CRUD

```ts
class BaseMapper<T> {
  // 新增
  insert(entity: T): Promise<number>;
  insertBatch(entities: T[]): Promise<number>;

  // 删除
  deleteById(id: any): Promise<number>;
  deleteBatchIds(ids: any[]): Promise<number>;
  delete(wrapper: LambdaQueryWrapper<T>): Promise<number>;

  // 修改
  updateById(entity: Partial<T>): Promise<number>;
  update(entity: Partial<T>, wrapper: LambdaQueryWrapper<T>): Promise<number>;

  // 查询
  selectById(id: any): Promise<T | null>;
  selectBatchIds(ids: any[]): Promise<T[]>;
  selectOne(wrapper: LambdaQueryWrapper<T>): Promise<T | null>;
  selectList(wrapper?: LambdaQueryWrapper<T>): Promise<T[]>;
  selectCount(wrapper?: LambdaQueryWrapper<T>): Promise<number>;
  selectPage(page: number, size: number, wrapper?: LambdaQueryWrapper<T>): Promise<Page<T>>;

  // 链式入口
  lambdaQuery(): LambdaQueryWrapper<T>;
  lambdaUpdate(): LambdaUpdateWrapper<T>;
}
```

使用方式：

```ts
class UserMapper extends BaseMapper<User> {}

const userMapper = new UserMapper(User, datasource);

// CRUD
await userMapper.insert({ userName: '张三', age: 20, email: 'zs@test.com' });
await userMapper.updateById({ id: 1, age: 21 });
await userMapper.deleteById(1);
const user = await userMapper.selectById(1);
```

## 8. 实现优先级

| 阶段 | 内容 | 预估 |
|------|------|------|
| P0 | 数据源、执行器、装饰器、BaseMapper CRUD | 3天 |
| P1 | LambdaQueryWrapper / LambdaUpdateWrapper | 2天 |
| P2 | 动态 SQL 模板解析 | 2天 |
| P3 | 自定义 SQL、分页插件 | 1天 |
| P4 | 多数据库方言、事务管理 | 2天 |
| P5 | 软删除、乐观锁、日志插件 | 1天 |
