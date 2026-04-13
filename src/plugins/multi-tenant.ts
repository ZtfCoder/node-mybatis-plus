import type { Plugin, PluginContext } from '../types';

export interface MultiTenantOptions {
  /**
   * 获取当前租户 ID 的函数（支持同步/异步）
   * @example () => AsyncLocalStorage.getStore()?.tenantId
   */
  getTenantId: () => any | Promise<any>;

  /** 租户字段的数据库列名，默认 'tenant_id' */
  tenantColumn?: string;

  /**
   * 忽略多租户隔离的表名列表
   * @example ['sys_config', 'sys_dict']
   */
  ignoreTables?: string[];

  /**
   * 是否在 INSERT 时自动填充租户 ID，默认 true
   */
  fillOnInsert?: boolean;
}

/**
 * 多租户插件
 *
 * SELECT → 自动追加 WHERE tenant_id = ?
 * INSERT → 自动填充 tenant_id 列
 * UPDATE → 自动追加 WHERE tenant_id = ?
 * DELETE → 自动追加 WHERE tenant_id = ?（逻辑删除改写后也会追加）
 */
export function createMultiTenantPlugin(options: MultiTenantOptions): Plugin {
  const tenantCol = options.tenantColumn ?? 'tenant_id';
  const ignoreTables = new Set(options.ignoreTables ?? []);
  const fillOnInsert = options.fillOnInsert ?? true;

  return {
    name: 'multi-tenant',
    order: -80,

    async beforeExecute(ctx: PluginContext): Promise<void> {
      const { node } = ctx;

      // 忽略表检查
      if (ignoreTables.has(node.table)) return;

      const tenantId = await options.getTenantId();
      if (tenantId == null) return; // 没有租户 ID，跳过（如超级管理员）

      const quotedCol = `\`${tenantCol}\``;

      if (node.type === 'select' || node.type === 'update' || node.type === 'delete') {
        // 追加租户条件
        const condition = `${quotedCol} = ?`;
        if (ctx.sql.toUpperCase().includes(' WHERE ')) {
          ctx.sql = ctx.sql.replace(/ WHERE /i, ` WHERE ${condition} AND `);
        } else {
          // 在 ORDER BY / GROUP BY / LIMIT / 末尾之前插入
          const insertBefore = / ORDER BY | GROUP BY | LIMIT /i.exec(ctx.sql);
          if (insertBefore) {
            ctx.sql =
              ctx.sql.slice(0, insertBefore.index) +
              ` WHERE ${condition}` +
              ctx.sql.slice(insertBefore.index);
          } else {
            ctx.sql += ` WHERE ${condition}`;
          }
        }
        ctx.params = [tenantId, ...ctx.params];

      } else if (node.type === 'insert' && fillOnInsert) {
        // INSERT 时自动填充租户 ID
        // 检查是否已有 tenant_id 列
        if (ctx.sql.includes(tenantCol)) return;

        // INSERT INTO `table` (`col1`, `col2`) VALUES (?, ?) 或批量
        // 处理批量插入：VALUES (?, ?), (?, ?)
        ctx.sql = ctx.sql.replace(
          /\(([^)]+)\)\s+VALUES\s+([\s\S]+)$/i,
          (_, cols, vals) => {
            // 每组 VALUES 都追加一个 ?
            const newVals = vals.replace(/\(([^)]+)\)/g, (_: string, v: string) => `(${v}, ?)`);
            return `(${cols}, ${quotedCol}) VALUES ${newVals}`;
          }
        );

        // 批量插入时每行都需要插入 tenantId
        const rowCount = (ctx.sql.match(/\(/g) || []).length - 1; // 减去列定义的括号
        const insertParamCount = ctx.params.length;
        const paramsPerRow = insertParamCount / Math.max(rowCount, 1);

        // 在每行参数末尾插入 tenantId
        const newParams: any[] = [];
        for (let i = 0; i < ctx.params.length; i += paramsPerRow) {
          newParams.push(...ctx.params.slice(i, i + paramsPerRow), tenantId);
        }
        ctx.params = newParams;
      }
    },
  };
}
