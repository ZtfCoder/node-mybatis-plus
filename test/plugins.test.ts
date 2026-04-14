import { describe, it, expect, vi } from 'vitest';
import { createLogicDeletePlugin } from '../src/plugins/logic-delete';
import { createAutoFillPlugin } from '../src/plugins/auto-fill';
import { createMultiTenantPlugin } from '../src/plugins/multi-tenant';
import { createDialect } from '../src/dialect';
import type { PluginContext, EntityMeta, Dialect } from '../src/types';

// ============ 三种方言的测试数据 ============

interface DialectFixture {
  name: string;
  dialect: Dialect;
  q: (s: string) => string;   // 引号包裹
  ph: (n: number) => string;  // 占位符
}

const dialects: DialectFixture[] = [
  { name: 'mysql', dialect: createDialect('mysql'), q: s => `\`${s}\``, ph: () => '?' },
  { name: 'postgres', dialect: createDialect('postgres'), q: s => `"${s}"`, ph: n => `$${n}` },
  { name: 'sqlite', dialect: createDialect('sqlite'), q: s => `"${s}"`, ph: () => '?' },
];

function makeCtx(dialect: Dialect, overrides: Partial<PluginContext> & { entityMeta?: Partial<EntityMeta> } = {}): PluginContext {
  const { entityMeta: metaOverrides, ...rest } = overrides;
  const entityMeta: EntityMeta = {
    tableName: 'sys_user',
    columns: [],
    idColumn: null,
    target: class {},
    ...metaOverrides,
  };
  return {
    node: { type: 'select', table: 'sys_user', columns: [], where: null, orderBy: [], groupBy: [], having: null, limit: null },
    sql: '',
    params: [],
    entityMeta,
    dialect,
    ...rest,
  } as PluginContext;
}

// ============ 逻辑删除插件 ============

describe.each(dialects)('LogicDeletePlugin ($name)', ({ dialect, q, ph }) => {
  const ldCol = {
    propertyName: 'deleted', columnName: 'deleted',
    isPrimary: false, exist: true,
    isLogicDelete: true, logicDeleteValue: 1, logicNotDeleteValue: 0,
  };
  const entityMeta: EntityMeta = {
    tableName: 'sys_user', columns: [ldCol], idColumn: null,
    target: class {}, logicDeleteColumn: ldCol,
  };
  const plugin = createLogicDeletePlugin();

  it('SELECT 无 WHERE 时追加 WHERE deleted = 0', () => {
    const ctx = makeCtx(dialect, { entityMeta, sql: `SELECT * FROM ${q('sys_user')}`, params: [] });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(`SELECT * FROM ${q('sys_user')} WHERE ${q('deleted')} = ${ph(1)}`);
    expect(ctx.params).toEqual([0]);
  });

  it('SELECT 有 WHERE 时在 WHERE 后追加条件', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      sql: `SELECT * FROM ${q('sys_user')} WHERE ${q('age')} >= ${ph(1)}`,
      params: [18],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(`SELECT * FROM ${q('sys_user')} WHERE ${q('deleted')} = ${ph(1)} AND ${q('age')} >= ${ph(2)}`);
    expect(ctx.params).toEqual([0, 18]);
  });

  it('SELECT 有 ORDER BY 无 WHERE 时正确插入 WHERE', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      sql: `SELECT * FROM ${q('sys_user')} ORDER BY ${q('id')} DESC`,
      params: [],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(`WHERE ${q('deleted')} = ${ph(1)}`);
    expect(ctx.sql.indexOf('WHERE')).toBeLessThan(ctx.sql.indexOf('ORDER BY'));
  });

  it('DELETE 无 WHERE 改写为 UPDATE SET deleted = 1', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'delete', table: 'sys_user', where: null },
      sql: `DELETE FROM ${q('sys_user')}`,
      params: [],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(`UPDATE ${q('sys_user')} SET ${q('deleted')} = ${ph(1)} WHERE ${q('deleted')} = ${ph(2)}`);
    expect(ctx.params).toEqual([1, 0]);
  });

  it('DELETE 有 WHERE 改写为 UPDATE 并保留原条件', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'delete', table: 'sys_user', where: null },
      sql: `DELETE FROM ${q('sys_user')} WHERE ${q('id')} = ${ph(1)}`,
      params: [1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(`UPDATE ${q('sys_user')} SET ${q('deleted')} = ${ph(1)}`);
    expect(ctx.sql).toContain(q('id'));
    expect(ctx.sql).toContain(q('deleted'));
    expect(ctx.params[0]).toBe(1);  // deleteValue
    expect(ctx.params[1]).toBe(1);  // original id param
    expect(ctx.params[2]).toBe(0);  // notDeleteValue
  });

  it('UPDATE 有 WHERE 时追加 AND deleted = 0', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: `UPDATE ${q('sys_user')} SET ${q('age')} = ${ph(1)} WHERE ${q('id')} = ${ph(2)}`,
      params: [25, 1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(`AND ${q('deleted')} = ${ph(3)}`);
    expect(ctx.params).toEqual([25, 1, 0]);
  });

  it('UPDATE 无 WHERE 时追加 WHERE deleted = 0', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: `UPDATE ${q('sys_user')} SET ${q('age')} = ${ph(1)}`,
      params: [25],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(`WHERE ${q('deleted')} = ${ph(2)}`);
    expect(ctx.params).toEqual([25, 0]);
  });

  it('没有 logicDeleteColumn 时跳过', () => {
    const ctx = makeCtx(dialect, { sql: `SELECT * FROM ${q('sys_user')}`, params: [] });
    const originalSql = ctx.sql;
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(originalSql);
  });
});

// ============ 自动填充插件 ============

describe.each(dialects)('AutoFillPlugin ($name)', ({ dialect, q, ph }) => {
  const now = new Date('2024-01-01');
  const handler = vi.fn((field: string) => {
    if (field === 'createTime' || field === 'updateTime') return now;
    return undefined;
  });

  const entityMeta: EntityMeta = {
    tableName: 'sys_user',
    columns: [
      { propertyName: 'createTime', columnName: 'create_time', isPrimary: false, exist: true, fill: 'insert' },
      { propertyName: 'updateTime', columnName: 'update_time', isPrimary: false, exist: true, fill: 'insertAndUpdate' },
    ],
    idColumn: null,
    target: class {},
  };

  const plugin = createAutoFillPlugin({ handler });

  it('INSERT 单行时填充 insert 和 insertAndUpdate 字段', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'insert', table: 'sys_user', columns: ['user_name'], values: [['张三']] },
      sql: `INSERT INTO ${q('sys_user')} (${q('user_name')}) VALUES (${ph(1)})`,
      params: ['张三'],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('create_time'));
    expect(ctx.sql).toContain(q('update_time'));
    expect(ctx.params).toContain(now);
  });

  it('INSERT 批量时每行都填充', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'insert', table: 'sys_user', columns: ['user_name'], values: [['张三'], ['李四']] },
      sql: `INSERT INTO ${q('sys_user')} (${q('user_name')}) VALUES (${ph(1)}), (${ph(2)})`,
      params: ['张三', '李四'],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('create_time'));
    expect(ctx.params.filter(p => p === now).length).toBeGreaterThanOrEqual(2);
  });

  it('UPDATE 有 WHERE 时只填充 update 和 insertAndUpdate 字段', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: `UPDATE ${q('sys_user')} SET ${q('age')} = ${ph(1)} WHERE ${q('id')} = ${ph(2)}`,
      params: [25, 1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('update_time'));
    expect(ctx.sql).not.toContain(q('create_time'));
    const updateTimeIdx = ctx.params.indexOf(now);
    const idIdx = ctx.params.indexOf(1);
    expect(updateTimeIdx).toBeLessThan(idIdx);
  });

  it('UPDATE 无 WHERE 时追加到末尾', () => {
    const ctx = makeCtx(dialect, {
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: `UPDATE ${q('sys_user')} SET ${q('age')} = ${ph(1)}`,
      params: [25],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('update_time'));
    expect(ctx.params).toContain(now);
  });
});

// ============ 多租户插件 ============

describe.each(dialects)('MultiTenantPlugin ($name)', ({ dialect, q, ph }) => {
  const plugin = createMultiTenantPlugin({ getTenantId: () => 42, tenantColumn: 'tenant_id' });

  it('SELECT 无 WHERE 追加 WHERE tenant_id = ?', async () => {
    const ctx = makeCtx(dialect, { sql: `SELECT * FROM ${q('sys_user')}`, params: [] });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(`SELECT * FROM ${q('sys_user')} WHERE ${q('tenant_id')} = ${ph(1)}`);
    expect(ctx.params).toEqual([42]);
  });

  it('SELECT 有 WHERE 时追加 AND', async () => {
    const ctx = makeCtx(dialect, {
      sql: `SELECT * FROM ${q('sys_user')} WHERE ${q('age')} >= ${ph(1)}`,
      params: [18],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(`SELECT * FROM ${q('sys_user')} WHERE ${q('tenant_id')} = ${ph(1)} AND ${q('age')} >= ${ph(2)}`);
    expect(ctx.params).toEqual([42, 18]);
  });

  it('SELECT 有 ORDER BY 无 WHERE 时正确插入', async () => {
    const ctx = makeCtx(dialect, {
      sql: `SELECT * FROM ${q('sys_user')} ORDER BY ${q('id')} DESC`,
      params: [],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(`WHERE ${q('tenant_id')} = ${ph(1)}`);
    expect(ctx.sql.indexOf('WHERE')).toBeLessThan(ctx.sql.indexOf('ORDER BY'));
  });

  it('UPDATE 追加租户条件', async () => {
    const ctx = makeCtx(dialect, {
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: `UPDATE ${q('sys_user')} SET ${q('age')} = ${ph(1)} WHERE ${q('id')} = ${ph(2)}`,
      params: [25, 1],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('tenant_id'));
    expect(ctx.params).toContain(42);
  });

  it('INSERT 单行自动填充 tenant_id', async () => {
    const ctx = makeCtx(dialect, {
      node: { type: 'insert', table: 'sys_user', columns: ['user_name'], values: [['张三']] },
      sql: `INSERT INTO ${q('sys_user')} (${q('user_name')}) VALUES (${ph(1)})`,
      params: ['张三'],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('tenant_id'));
    expect(ctx.params).toContain(42);
  });

  it('INSERT 批量时每行都填充 tenant_id', async () => {
    const ctx = makeCtx(dialect, {
      node: { type: 'insert', table: 'sys_user', columns: ['user_name'], values: [['张三'], ['李四']] },
      sql: `INSERT INTO ${q('sys_user')} (${q('user_name')}) VALUES (${ph(1)}), (${ph(2)})`,
      params: ['张三', '李四'],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain(q('tenant_id'));
    expect(ctx.params.filter(p => p === 42).length).toBe(2);
  });

  it('ignoreTables 中的表跳过', async () => {
    const p = createMultiTenantPlugin({ getTenantId: () => 42, ignoreTables: ['sys_config'] });
    const ctx = makeCtx(dialect, {
      node: { type: 'select', table: 'sys_config', columns: [], where: null, orderBy: [], groupBy: [], having: null, limit: null },
      sql: `SELECT * FROM ${q('sys_config')}`,
      params: [],
    });
    await p.beforeExecute!(ctx);
    expect(ctx.sql).not.toContain('tenant_id');
  });

  it('getTenantId 返回 null 时跳过', async () => {
    const p = createMultiTenantPlugin({ getTenantId: () => null });
    const ctx = makeCtx(dialect, { sql: `SELECT * FROM ${q('sys_user')}`, params: [] });
    const originalSql = ctx.sql;
    await p.beforeExecute!(ctx);
    expect(ctx.sql).toBe(originalSql);
  });
});
