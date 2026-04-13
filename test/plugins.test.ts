import { describe, it, expect, vi } from 'vitest';
import { createLogicDeletePlugin } from '../src/plugins/logic-delete';
import { createAutoFillPlugin } from '../src/plugins/auto-fill';
import { createMultiTenantPlugin } from '../src/plugins/multi-tenant';
import type { PluginContext, EntityMeta } from '../src/types';

// ---- 工具函数 ----

function makeCtx(overrides: Partial<PluginContext>): PluginContext {
  const entityMeta: EntityMeta = {
    tableName: 'sys_user',
    columns: [],
    idColumn: null,
    target: class {},
    ...overrides.entityMeta,
  };
  return {
    node: { type: 'select', table: 'sys_user', columns: [], where: null, orderBy: [], groupBy: [], having: null, limit: null },
    sql: 'SELECT * FROM `sys_user`',
    params: [],
    entityMeta,
    ...overrides,
  } as PluginContext;
}

// ============ 逻辑删除插件 ============

describe('LogicDeletePlugin', () => {
  const ldCol = {
    propertyName: 'deleted',
    columnName: 'deleted',
    isPrimary: false,
    exist: true,
    isLogicDelete: true,
    logicDeleteValue: 1,
    logicNotDeleteValue: 0,
  };

  const entityMeta: EntityMeta = {
    tableName: 'sys_user',
    columns: [ldCol],
    idColumn: null,
    target: class {},
    logicDeleteColumn: ldCol,
  };

  const plugin = createLogicDeletePlugin();

  it('SELECT 自动追加 WHERE deleted = 0', () => {
    const ctx = makeCtx({ entityMeta, sql: 'SELECT * FROM `sys_user`', params: [] });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('WHERE `deleted` = ?');
    expect(ctx.params[0]).toBe(0);
  });

  it('SELECT 已有 WHERE 时追加 AND', () => {
    const ctx = makeCtx({
      entityMeta,
      sql: 'SELECT * FROM `sys_user` WHERE `age` >= ?',
      params: [18],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('WHERE `deleted` = ? AND `age` >= ?');
    expect(ctx.params).toEqual([0, 18]);
  });

  it('DELETE 改写为 UPDATE SET deleted = 1', () => {
    const ctx = makeCtx({
      entityMeta,
      node: { type: 'delete', table: 'sys_user', where: null },
      sql: 'DELETE FROM `sys_user` WHERE `id` = ?',
      params: [1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('UPDATE `sys_user` SET `deleted` = ?');
    expect(ctx.params[0]).toBe(1); // deleteValue
  });

  it('UPDATE 追加 AND deleted = 0', () => {
    const ctx = makeCtx({
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: 'UPDATE `sys_user` SET `age` = ? WHERE `id` = ?',
      params: [25, 1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('AND `deleted` = ?');
    expect(ctx.params[ctx.params.length - 1]).toBe(0);
  });

  it('没有 logicDeleteColumn 时跳过', () => {
    const ctx = makeCtx({ sql: 'SELECT * FROM `sys_user`', params: [] });
    const originalSql = ctx.sql;
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toBe(originalSql);
  });
});

// ============ 自动填充插件 ============

describe('AutoFillPlugin', () => {
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

  it('INSERT 时填充 insert 和 insertAndUpdate 字段', () => {
    const ctx = makeCtx({
      entityMeta,
      node: { type: 'insert', table: 'sys_user', columns: ['user_name'], values: [['张三']] },
      sql: 'INSERT INTO `sys_user` (`user_name`) VALUES (?)',
      params: ['张三'],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('`create_time`');
    expect(ctx.sql).toContain('`update_time`');
    expect(ctx.params).toContain(now);
  });

  it('UPDATE 时只填充 update 和 insertAndUpdate 字段', () => {
    const ctx = makeCtx({
      entityMeta,
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: 'UPDATE `sys_user` SET `age` = ? WHERE `id` = ?',
      params: [25, 1],
    });
    plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('`update_time`');
    expect(ctx.sql).not.toContain('`create_time`');
  });
});

// ============ 多租户插件 ============

describe('MultiTenantPlugin', () => {
  const plugin = createMultiTenantPlugin({
    getTenantId: () => 42,
    tenantColumn: 'tenant_id',
  });

  it('SELECT 追加 WHERE tenant_id = ?', async () => {
    const ctx = makeCtx({ sql: 'SELECT * FROM `sys_user`', params: [] });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('WHERE `tenant_id` = ?');
    expect(ctx.params[0]).toBe(42);
  });

  it('SELECT 已有 WHERE 时追加 AND', async () => {
    const ctx = makeCtx({ sql: 'SELECT * FROM `sys_user` WHERE `age` >= ?', params: [18] });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('WHERE `tenant_id` = ? AND `age` >= ?');
    expect(ctx.params).toEqual([42, 18]);
  });

  it('UPDATE 追加租户条件', async () => {
    const ctx = makeCtx({
      node: { type: 'update', table: 'sys_user', sets: [], where: null },
      sql: 'UPDATE `sys_user` SET `age` = ? WHERE `id` = ?',
      params: [25, 1],
    });
    await plugin.beforeExecute!(ctx);
    expect(ctx.sql).toContain('tenant_id');
    expect(ctx.params).toContain(42);
  });

  it('ignoreTables 中的表跳过', async () => {
    const pluginWithIgnore = createMultiTenantPlugin({
      getTenantId: () => 42,
      ignoreTables: ['sys_config'],
    });
    const ctx = makeCtx({
      node: { type: 'select', table: 'sys_config', columns: [], where: null, orderBy: [], groupBy: [], having: null, limit: null },
      sql: 'SELECT * FROM `sys_config`',
      params: [],
    });
    await pluginWithIgnore.beforeExecute!(ctx);
    expect(ctx.sql).not.toContain('tenant_id');
  });

  it('getTenantId 返回 null 时跳过', async () => {
    const pluginNoTenant = createMultiTenantPlugin({ getTenantId: () => null });
    const ctx = makeCtx({ sql: 'SELECT * FROM `sys_user`', params: [] });
    const originalSql = ctx.sql;
    await pluginNoTenant.beforeExecute!(ctx);
    expect(ctx.sql).toBe(originalSql);
  });
});
