import type { Plugin, PluginContext, SqlNode, EntityMeta, DataSource } from '../types';

/**
 * 按 order 排序后依次执行插件的 beforeExecute，
 * 执行 SQL，再依次执行 afterExecute，返回最终结果。
 */
export async function runPlugins(
  ds: DataSource,
  node: SqlNode,
  sql: string,
  params: any[],
  entityMeta: EntityMeta,
): Promise<any> {
  const plugins = [...ds.plugins].sort((a, b) => a.order - b.order);
  const ctx: PluginContext = { node, sql, params, entityMeta };

  // beforeExecute
  for (const p of plugins) {
    if (p.beforeExecute) {
      await p.beforeExecute(ctx);
    }
  }

  // 执行（使用可能被插件修改过的 sql / params）
  let result = await ds.execute(ctx.sql, ctx.params);

  // afterExecute
  for (const p of plugins) {
    if (p.afterExecute) {
      const r = await p.afterExecute(ctx, result);
      if (r !== undefined) result = r;
    }
  }

  return result;
}
