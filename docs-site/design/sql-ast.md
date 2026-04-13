# SQL AST 设计

node-mybatis-plus 不直接拼接 SQL 字符串，而是先将查询意图构建为一棵抽象语法树（AST），再由 `SqlBuilder` 配合 `Dialect` 编译为具体数据库的 SQL。这种中间表示是整个框架实现多方言支持的关键。

## 为什么使用 AST 中间表示

直接拼接 SQL 字符串存在以下问题：

1. **方言耦合** — 不同数据库的占位符、标识符引用、分页语法各不相同，直接拼接需要在每个拼接点处理差异
2. **插件难以介入** — 字符串形式的 SQL 难以被插件安全地修改（如分页插件需要添加 LIMIT）
3. **条件构建与 SQL 生成混杂** — Wrapper 既要收集条件，又要关心 SQL 语法

引入 AST 中间层后：

- **Wrapper 层**只负责收集条件，生成与数据库无关的 AST 节点
- **SqlBuilder 层**遍历 AST，调用 Dialect 接口生成具体 SQL
- **插件**可以在 AST 层面修改查询（如修改 `node.limit`）
- 新增数据库方言只需实现 `Dialect` 接口，无需修改 Wrapper 或 Builder

## AST 节点定义

所有 SQL 操作被抽象为四种节点类型：

```ts
type SqlNodeType = 'select' | 'insert' | 'update' | 'delete';

type SqlNode = SelectNode | InsertNode | UpdateNode | DeleteNode;
```

### SelectNode

```ts
interface SelectNode {
  type: 'select';
  table: string;                    // 表名
  columns: string[];                // 查询列，空数组表示 SELECT *
  where: ConditionGroup | null;     // WHERE 条件树
  orderBy: OrderByItem[];           // ORDER BY 子句
  groupBy: string[];                // GROUP BY 列
  having: ConditionGroup | null;    // HAVING 条件
  limit: {                          // 分页参数
    offset: number;
    count: number;
  } | null;
}
```

### InsertNode

```ts
interface InsertNode {
  type: 'insert';
  table: string;          // 表名
  columns: string[];      // 插入列名
  values: any[][];        // 值数组（支持批量插入）
}
```

### UpdateNode

```ts
interface UpdateNode {
  type: 'update';
  table: string;                    // 表名
  sets: {                           // SET 子句
    column: string;
    value: any;
  }[];
  where: ConditionGroup | null;     // WHERE 条件
}
```

### DeleteNode

```ts
interface DeleteNode {
  type: 'delete';
  table: string;                    // 表名
  where: ConditionGroup | null;     // WHERE 条件
}
```

### 条件节点

条件使用树形结构表示，支持 AND/OR 嵌套：

```ts
interface Condition {
  column: string;       // 数据库列名（已映射）
  op: '=' | '!=' | '>' | '>=' | '<' | '<='
    | 'LIKE' | 'IN' | 'NOT IN' | 'BETWEEN'
    | 'IS NULL' | 'IS NOT NULL';
  value?: any;          // 参数值
  value2?: any;         // BETWEEN 的第二个值
}

interface ConditionGroup {
  logic: 'AND' | 'OR';
  items: (Condition | ConditionGroup)[];  // 支持递归嵌套
}

interface OrderByItem {
  column: string;
  direction: 'ASC' | 'DESC';
}
```

条件树示例：

```
ConditionGroup (AND)
├── Condition: user_name = '张三'
├── Condition: age >= 18
└── ConditionGroup (OR)          ← 嵌套 OR
    ├── Condition: email LIKE '%@gmail%'
    └── Condition: email LIKE '%@qq%'
```

对应 SQL：`WHERE user_name = ? AND age >= ? AND (email LIKE ? OR email LIKE ?)`

## Wrapper → AST 转换流程

以 `LambdaQueryWrapper` 为例，从用户调用到 AST 构建的完整流程：

```
用户代码                          Wrapper 内部状态
─────────                        ──────────────
.eq('userName', '张三')     →    conditionGroup.items.push({ column: 'user_name', op: '=', value: '张三' })
.ge('age', 18)              →    conditionGroup.items.push({ column: 'age', op: '>=', value: 18 })
.orderByDesc('id')          →    _orderBy.push({ column: 'id', direction: 'DESC' })
.select('userName', 'age')  →    _columns = ['user_name', 'age']
.page(1, 10)                →    _limit = { offset: 0, count: 10 }
                                      │
                                      ▼
.list()                     →    buildSelectNode() 组装 SelectNode
                                      │
                                      ▼
                                 SqlBuilder.build(node) 编译为 SQL
                                      │
                                      ▼
                                 DataSource.execute(sql, params)
```

`buildSelectNode()` 的实现：

```ts
buildSelectNode(): SelectNode {
  return {
    type: 'select',
    table: this.entityMeta.tableName,
    columns: this._columns,
    where: this.conditionGroup.items.length ? this.conditionGroup : null,
    orderBy: this._orderBy,
    groupBy: this._groupBy,
    having: this._having,
    limit: this._limit,
  };
}
```

字段名映射发生在每个条件方法内部，通过 `resolveColumn()` 查找 `EntityMeta`：

```ts
protected resolveColumn(propertyName: string): string {
  const col = this.entityMeta.columns.find(c => c.propertyName === propertyName);
  return col ? col.columnName : propertyName;
}
```

## SqlBuilder 编译流程

`SqlBuilder` 接收一个 `Dialect` 实例，将 `SqlNode` 编译为 `CompiledSql`：

```ts
interface CompiledSql {
  sql: string;
  params: any[];
}
```

编译过程：

```
SqlNode
  │
  ├── type === 'select' → buildSelect()
  │     ├── 生成 SELECT columns FROM table
  │     ├── 递归编译 where → buildConditionGroup()
  │     ├── 生成 GROUP BY / HAVING / ORDER BY
  │     └── 调用 dialect.paginate() 处理 LIMIT
  │
  ├── type === 'insert' → buildInsert()
  │     ├── 生成 INSERT INTO table (columns)
  │     └── 遍历 values，每个值调用 addParam()
  │
  ├── type === 'update' → buildUpdate()
  │     ├── 遍历 sets，生成 SET col = placeholder
  │     └── 递归编译 where
  │
  └── type === 'delete' → buildDelete()
        ├── 生成 DELETE FROM table
        └── 递归编译 where
```

## 参数绑定机制

`SqlBuilder` 内部维护一个参数数组和索引计数器。每次遇到需要绑定的值时，调用 `addParam()` 方法：

```ts
class SqlBuilder {
  private params: any[] = [];
  private paramIndex = 0;

  private addParam(value: any): string {
    this.params.push(value);
    return this.dialect.placeholder(++this.paramIndex);
  }
}
```

`addParam()` 做两件事：
1. 将值追加到 `params` 数组
2. 调用 `Dialect.placeholder(index)` 生成对应数据库的占位符

不同数据库的占位符差异：

| 数据库 | `placeholder(1)` | `placeholder(2)` | `placeholder(3)` |
|--------|-------------------|-------------------|-------------------|
| MySQL | `?` | `?` | `?` |
| PostgreSQL | `$1` | `$2` | `$3` |
| SQLite | `?` | `?` | `?` |

标识符引用通过 `Dialect.quote()` 处理：

```ts
private q(identifier: string): string {
  return this.dialect.quote(identifier);
}
// MySQL:      quote('user_name') → `user_name`
// PostgreSQL: quote('user_name') → "user_name"
// SQLite:     quote('user_name') → "user_name"
```

### 编译示例

输入 AST：

```ts
const node: SelectNode = {
  type: 'select',
  table: 'sys_user',
  columns: ['user_name', 'age'],
  where: {
    logic: 'AND',
    items: [
      { column: 'user_name', op: '=', value: '张三' },
      { column: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ column: 'id', direction: 'DESC' }],
  groupBy: [],
  having: null,
  limit: { offset: 0, count: 10 }
}
```

MySQL 输出：

```sql
SELECT `user_name`, `age` FROM `sys_user`
WHERE `user_name` = ? AND `age` >= ?
ORDER BY `id` DESC
LIMIT 10 OFFSET 0
-- params: ['张三', 18]
```

PostgreSQL 输出：

```sql
SELECT "user_name", "age" FROM "sys_user"
WHERE "user_name" = $1 AND "age" >= $2
ORDER BY "id" DESC
LIMIT 10 OFFSET 0
-- params: ['张三', 18]
```
