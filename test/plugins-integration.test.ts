import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id, LogicDelete } from '../src/decorator';
import { BaseMapper } from '../src/mapper/base-mapper';
import { createDataSource } from '../src/core/datasource';
import { createLogicDeletePlugin } from '../src/plugins/logic-delete';
import { createAutoFillPlugin } from '../src/plugins/auto-fill';
import { createMultiTenantPlugin } from '../src/plugins/multi-tenant';
import type { DataSource } from '../src/types';

// ============ 逻辑删除 ============

describe('LogicDelete Plugin - SQLite Integration', () => {
  @Table('nbp_ld_user')
  class LdUser {
    @Id({ type: 'auto' }) id!: number;
    @Column() name!: string;
    @Column() age!: number;
    @LogicDelete() deleted!: number;
  }
  class LdUserMapper extends BaseMapper<LdUser> {}

  let ds: DataSource;
  let mapper: LdUserMapper;

  beforeAll(async () => {
    ds = createDataSource({
      type: 'sqlite',
      database: ':memory:',
      plugins: [createLogicDeletePlugin()],
    });
    await ds.execute(`CREATE TABLE nbp_ld_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    )`, []);
    mapper = new LdUserMapper(LdUser, ds);
  });

  afterAll(async () => { await ds.close(); });

  beforeEach(async () => {
    await ds.execute('DELETE FROM nbp_ld_user', []);
    await ds.execute("INSERT INTO nbp_ld_user (name, age, deleted) VALUES ('Alice', 20, 0), ('Bob', 25, 0), ('Charlie', 30, 0)", []);
  });

  it('deleteById 改写为 UPDATE SET deleted=1', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);
    // 物理行还在，只是 deleted=1
    const raw = await ds.execute('SELECT * FROM nbp_ld_user', []);
    expect(raw).toHaveLength(3);
    const deleted = raw.find((r: any) => r.id === all[0].id);
    expect(deleted.deleted).toBe(1);
  });

  it('selectList 自动过滤已删除记录', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);
    const list = await mapper.selectList();
    expect(list).toHaveLength(2);
    expect(list.every((u: any) => u.name !== 'Alice')).toBe(true);
  });

  it('selectById 查不到已删除记录', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);
    const user = await mapper.selectById(all[0].id);
    expect(user).toBeNull();
  });

  it('selectCount 不计已删除记录', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);
    expect(await mapper.selectCount()).toBe(2);
  });

  it('lambdaQuery 条件查询自动过滤已删除', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[1].id); // delete Bob
    const list = await mapper.lambdaQuery().ge('age', 20).list();
    expect(list).toHaveLength(2); // Alice + Charlie
  });

  it('deleteBatchIds 批量逻辑删除', async () => {
    const all = await mapper.selectList();
    await mapper.deleteBatchIds([all[0].id, all[1].id]);
    expect(await mapper.selectList()).toHaveLength(1);
    expect((await mapper.selectList())[0].name).toBe('Charlie');
  });

  it('update 不影响已删除记录', async () => {
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);
    // 尝试更新所有人的 age，已删除的不应被更新
    const affected = await mapper.lambdaUpdate().set('age', 99).execute();
    expect(affected).toBe(2);
    // 验证已删除记录的 age 没变
    const raw = await ds.execute('SELECT * FROM nbp_ld_user WHERE id = ?', [all[0].id]);
    expect(raw[0].age).toBe(20);
  });
});

// ============ 自动填充 ============

describe('AutoFill Plugin - SQLite Integration', () => {
  @Table('nbp_af_user')
  class AfUser {
    @Id({ type: 'auto' }) id!: number;
    @Column() name!: string;
    @Column({ fill: 'insert' }) createTime!: string;
    @Column({ fill: 'insertAndUpdate' }) updateTime!: string;
  }
  class AfUserMapper extends BaseMapper<AfUser> {}

  let ds: DataSource;
  let mapper: AfUserMapper;

  beforeAll(async () => {
    ds = createDataSource({
      type: 'sqlite',
      database: ':memory:',
      plugins: [createAutoFillPlugin({
        handler: (field) => {
          if (field === 'createTime') return '2024-01-01 00:00:00';
          if (field === 'updateTime') return '2024-01-01 12:00:00';
        },
      })],
    });
    await ds.execute(`CREATE TABLE nbp_af_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      create_time TEXT,
      update_time TEXT
    )`, []);
    mapper = new AfUserMapper(AfUser, ds);
  });

  afterAll(async () => { await ds.close(); });

  beforeEach(async () => {
    await ds.execute('DELETE FROM nbp_af_user', []);
  });

  it('insert 自动填充 createTime 和 updateTime', async () => {
    await mapper.insert({ name: 'Alice' } as any);
    const raw = await ds.execute('SELECT * FROM nbp_af_user', []);
    expect(raw[0].create_time).toBe('2024-01-01 00:00:00');
    expect(raw[0].update_time).toBe('2024-01-01 12:00:00');
  });

  it('insertBatch 每行都自动填充', async () => {
    await mapper.insertBatch([{ name: 'Alice' } as any, { name: 'Bob' } as any]);
    const raw = await ds.execute('SELECT * FROM nbp_af_user', []);
    expect(raw).toHaveLength(2);
    for (const row of raw) {
      expect(row.create_time).toBe('2024-01-01 00:00:00');
      expect(row.update_time).toBe('2024-01-01 12:00:00');
    }
  });

  it('updateById 自动填充 updateTime 但不填充 createTime', async () => {
    await mapper.insert({ name: 'Alice' } as any);
    const all = await mapper.selectList();
    // 手动把 create_time 改掉，验证 update 不会覆盖它
    await ds.execute('UPDATE nbp_af_user SET create_time = ? WHERE id = ?', ['original', all[0].id]);

    await mapper.updateById({ id: all[0].id, name: 'Alice2' } as any);
    const raw = await ds.execute('SELECT * FROM nbp_af_user WHERE id = ?', [all[0].id]);
    expect(raw[0].create_time).toBe('original'); // 不被覆盖
    expect(raw[0].update_time).toBe('2024-01-01 12:00:00');
  });

  it('lambdaUpdate 自动填充 updateTime', async () => {
    await mapper.insert({ name: 'Alice' } as any);
    await ds.execute('UPDATE nbp_af_user SET update_time = ?', ['old']);

    await mapper.lambdaUpdate().set('name', 'Alice2').eq('name', 'Alice').execute();
    const raw = await ds.execute('SELECT * FROM nbp_af_user', []);
    expect(raw[0].update_time).toBe('2024-01-01 12:00:00');
  });
});

// ============ 多租户 ============

describe('MultiTenant Plugin - SQLite Integration', () => {
  @Table('nbp_mt_user')
  class MtUser {
    @Id({ type: 'auto' }) id!: number;
    @Column() name!: string;
    @Column() age!: number;
    @Column('tenant_id') tenantId!: number;
  }
  class MtUserMapper extends BaseMapper<MtUser> {}

  let ds: DataSource;
  let mapper: MtUserMapper;
  let currentTenantId = 1;

  beforeAll(async () => {
    ds = createDataSource({
      type: 'sqlite',
      database: ':memory:',
      plugins: [createMultiTenantPlugin({
        getTenantId: () => currentTenantId,
        tenantColumn: 'tenant_id',
      })],
    });
    await ds.execute(`CREATE TABLE nbp_mt_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL
    )`, []);
    mapper = new MtUserMapper(MtUser, ds);
  });

  afterAll(async () => { await ds.close(); });

  beforeEach(async () => {
    await ds.execute('DELETE FROM nbp_mt_user', []);
    currentTenantId = 1;
    // 手动插入不同租户的数据（绕过插件）
    await ds.execute("INSERT INTO nbp_mt_user (name, age, tenant_id) VALUES ('Alice', 20, 1), ('Bob', 25, 1), ('Charlie', 30, 2), ('Dave', 35, 2)", []);
  });

  it('selectList 只返回当前租户数据', async () => {
    const list = await mapper.selectList();
    expect(list).toHaveLength(2);
    expect(list.every((u: any) => u.tenant_id === 1)).toBe(true);
  });

  it('切换租户后查到不同数据', async () => {
    currentTenantId = 2;
    const list = await mapper.selectList();
    expect(list).toHaveLength(2);
    expect(list.every((u: any) => u.tenant_id === 2)).toBe(true);
  });

  it('selectCount 只计当前租户', async () => {
    expect(await mapper.selectCount()).toBe(2);
    currentTenantId = 2;
    expect(await mapper.selectCount()).toBe(2);
  });

  it('lambdaQuery 条件查询限定租户', async () => {
    const list = await mapper.lambdaQuery().ge('age', 20).list();
    expect(list).toHaveLength(2); // 只有租户1的 Alice(20) + Bob(25)
  });

  it('insert 自动填充 tenant_id', async () => {
    await mapper.insert({ name: 'Eve', age: 40 } as any);
    const raw = await ds.execute("SELECT * FROM nbp_mt_user WHERE name = 'Eve'", []);
    expect(raw[0].tenant_id).toBe(1);
  });

  it('insertBatch 每行都填充 tenant_id', async () => {
    currentTenantId = 3;
    await mapper.insertBatch([{ name: 'F', age: 1 } as any, { name: 'G', age: 2 } as any]);
    const raw = await ds.execute('SELECT * FROM nbp_mt_user WHERE tenant_id = 3', []);
    expect(raw).toHaveLength(2);
  });

  it('updateById 只能更新当前租户的记录', async () => {
    const list = await mapper.selectList(); // 租户1的记录
    const affected = await mapper.updateById({ id: list[0].id, age: 99 } as any);
    expect(affected).toBe(1);
    // 尝试更新租户2的记录（用租户2的 id）
    const raw = await ds.execute('SELECT * FROM nbp_mt_user WHERE tenant_id = 2', []);
    const affected2 = await mapper.updateById({ id: raw[0].id, age: 99 } as any);
    expect(affected2).toBe(0); // 租户隔离，更新不到
  });

  it('deleteById 只能删除当前租户的记录', async () => {
    const raw = await ds.execute('SELECT * FROM nbp_mt_user WHERE tenant_id = 2', []);
    const affected = await mapper.deleteById(raw[0].id);
    expect(affected).toBe(0); // 租户1删不了租户2的数据
    // 物理行还在
    const remaining = await ds.execute('SELECT COUNT(*) as cnt FROM nbp_mt_user', []);
    expect(remaining[0].cnt).toBe(4);
  });

  it('delete with wrapper 限定租户', async () => {
    await mapper.delete(mapper.lambdaQuery().ge('age', 20));
    // 只删了租户1的，租户2的还在
    const raw = await ds.execute('SELECT * FROM nbp_mt_user', []);
    expect(raw).toHaveLength(2);
    expect(raw.every((r: any) => r.tenant_id === 2)).toBe(true);
  });
});

// ============ 插件组合 ============

describe('Plugin Combination - SQLite Integration', () => {
  @Table('nbp_combo_user')
  class ComboUser {
    @Id({ type: 'auto' }) id!: number;
    @Column() name!: string;
    @Column({ fill: 'insert' }) createTime!: string;
    @Column('tenant_id') tenantId!: number;
    @LogicDelete() deleted!: number;
  }
  class ComboUserMapper extends BaseMapper<ComboUser> {}

  let ds: DataSource;
  let mapper: ComboUserMapper;

  beforeAll(async () => {
    ds = createDataSource({
      type: 'sqlite',
      database: ':memory:',
      plugins: [
        createLogicDeletePlugin(),
        createAutoFillPlugin({
          handler: (field) => {
            if (field === 'createTime') return '2024-01-01';
          },
        }),
        createMultiTenantPlugin({ getTenantId: () => 1, tenantColumn: 'tenant_id' }),
      ],
    });
    await ds.execute(`CREATE TABLE nbp_combo_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      create_time TEXT,
      tenant_id INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0
    )`, []);
    mapper = new ComboUserMapper(ComboUser, ds);
  });

  afterAll(async () => { await ds.close(); });

  beforeEach(async () => {
    await ds.execute('DELETE FROM nbp_combo_user', []);
  });

  it('insert 同时填充 createTime 和 tenant_id', async () => {
    await mapper.insert({ name: 'Alice' } as any);
    const raw = await ds.execute('SELECT * FROM nbp_combo_user', []);
    expect(raw[0].create_time).toBe('2024-01-01');
    expect(raw[0].tenant_id).toBe(1);
    expect(raw[0].deleted).toBe(0);
  });

  it('逻辑删除 + 租户隔离 + 自动填充 协同工作', async () => {
    await mapper.insert({ name: 'Alice' } as any);
    await mapper.insert({ name: 'Bob' } as any);
    // 手动插入租户2的数据
    await ds.execute("INSERT INTO nbp_combo_user (name, create_time, tenant_id, deleted) VALUES ('Other', '2024-01-01', 2, 0)", []);

    // 逻辑删除 Alice
    const all = await mapper.selectList();
    await mapper.deleteById(all[0].id);

    // selectList 应该只返回租户1的未删除记录
    const list = await mapper.selectList();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Bob');

    // 物理上三行都在
    const raw = await ds.execute('SELECT * FROM nbp_combo_user', []);
    expect(raw).toHaveLength(3);
  });
});
