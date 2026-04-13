import { AsyncLocalStorage } from 'async_hooks';
import type { DataSource, Connection } from '../types';

interface TxContext {
  connection: Connection;
  datasource: DataSource;
}

const txStore = new AsyncLocalStorage<TxContext>();

/** 获取当前事务连接（Executor 内部调用） */
export function getCurrentTxConnection(): TxContext | undefined {
  return txStore.getStore();
}

/** 编程式事务（配合 AsyncLocalStorage 自动传播） */
export async function withTransaction<T>(ds: DataSource, fn: () => Promise<T>): Promise<T> {
  // 如果已在事务中，直接复用（事务传播）
  const existing = txStore.getStore();
  if (existing && existing.datasource === ds) {
    return fn();
  }

  const conn = await ds.getConnection();
  await conn.query('BEGIN', []);
  const ctx: TxContext = { connection: conn, datasource: ds };

  try {
    const result = await txStore.run(ctx, fn);
    await conn.query('COMMIT', []);
    return result;
  } catch (e) {
    await conn.query('ROLLBACK', []);
    throw e;
  } finally {
    conn.release();
  }
}

// ============ 全局数据源注册（装饰器需要） ============

let defaultDataSource: DataSource | null = null;

export function setDefaultDataSource(ds: DataSource): void {
  defaultDataSource = ds;
}

export function getDefaultDataSource(): DataSource {
  if (!defaultDataSource) throw new Error('No default DataSource set. Call setDefaultDataSource() first.');
  return defaultDataSource;
}

// ============ @Transactional 装饰器 ============

export interface TransactionalOptions {
  datasource?: DataSource;
}

export function Transactional(options?: TransactionalOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const ds = options?.datasource ?? defaultDataSource;
      if (!ds) throw new Error('No DataSource available for @Transactional. Set default or pass in options.');
      return withTransaction(ds, () => original.apply(this, args));
    };
    return descriptor;
  };
}
