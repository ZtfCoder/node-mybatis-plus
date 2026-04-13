# 数据源配置

node-mybatis-plus 通过 `createDataSource` 创建数据源，支持 MySQL、PostgreSQL 和 SQLite 三种数据库。

## MySQL 配置

```ts
import { createDataSource } from 'node-mybatis-plus';

const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: '******',
});
```

需要安装驱动：

```bash
npm install mysql2
```

## PostgreSQL 配置

```ts
const ds = createDataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  password: '******',
});
```

需要安装驱动：

```bash
npm install pg
```

## SQLite 配置

SQLite 支持文件数据库和内存数据库两种模式：

```ts
// 文件数据库
const ds = createDataSource({
  type: 'sqlite',
  database: './data.db',
});

// 内存数据库（适合测试）
const ds = createDataSource({
  type: 'sqlite',
  database: ':memory:',
});
```

需要安装驱动：

```bash
npm install better-sqlite3
```

::: tip
SQLite 内存数据库在进程退出后数据会丢失，非常适合单元测试和快速原型开发。
:::

## 连接池配置

通过 `pool` 选项配置连接池参数：

```ts
const ds = createDataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: '******',
  pool: {
    min: 2,           // 最小连接数
    max: 10,          // 最大连接数
    idleTimeout: 30000, // 空闲连接超时时间（毫秒）
  },
});
```

### PoolConfig 选项

```ts
interface PoolConfig {
  min?: number;          // 最小连接数，默认由驱动决定
  max?: number;          // 最大连接数，默认 10
  idleTimeout?: number;  // 空闲连接超时（ms），默认 30000
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `min` | `number` | - | 连接池最小连接数 |
| `max` | `number` | `10` | 连接池最大连接数 |
| `idleTimeout` | `number` | `30000` | 空闲连接超时时间（毫秒） |

::: warning
SQLite 是嵌入式数据库，不使用网络连接池。连接池配置对 SQLite 不生效。
:::

## 关闭数据源

应用退出时应关闭数据源，释放连接池资源：

```ts
await ds.close();
```

在 Node.js 中可以监听进程退出事件：

```ts
process.on('SIGINT', async () => {
  await ds.close();
  process.exit(0);
});
```

## 完整配置参考

```ts
interface DataSourceConfig {
  type: 'mysql' | 'postgres' | 'sqlite';  // 数据库类型
  host?: string;       // 数据库地址（SQLite 不需要）
  port?: number;       // 端口号（SQLite 不需要）
  database: string;    // 数据库名（SQLite 为文件路径或 ':memory:'）
  username?: string;   // 用户名（SQLite 不需要）
  password?: string;   // 密码（SQLite 不需要）
  pool?: PoolConfig;   // 连接池配置（可选）
  plugins?: Plugin[];  // 插件数组（可选）
}
```
