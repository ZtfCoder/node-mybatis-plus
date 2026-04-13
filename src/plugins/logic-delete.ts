import type { Plugin, PluginContext } from '../types';

/**
 * 逻辑删除插件
 *
 * 拦截 DELETE → 改写为 UPDATE SET deleted = deleteValue
 * 拦截 SELECT → 自动追加 WHERE deleted = notDeleteValue
 * 拦截 UPDATE → 自动追加 WHERE deleted = notDeleteValue（防止误更新已删除数据）
 *
 * 需要实体上有 @LogicDelete 装饰的字段才会生效
 */
export function createLogicDeletePlugin(): Plugin {
  return {
    name: 'logic-delete',
    order: -100, // 最先执行，确保 SQL 改写在其他插件之前

    beforeExecute(ctx: PluginContext): void {
      const { entityMeta, node } = ctx;
      const ldCol = entityMeta.logicDeleteColumn;
      if (!ldCol) return; // 实体没有逻辑删除字段，跳过

      const col = ldCol.columnName;
      const deleteVal = ldCol.logicDeleteValue ?? 1;
      const notDeleteVal = ldCol.logicNotDeleteValue ?? 0;

      if (node.type === 'delete') {
        // DELETE → UPDATE SET {col} = deleteVal WHERE original_conditions AND {col} = notDeleteVal
        const originalWhere = ctx.sql.match(/WHERE\s+(.+)$/is)?.[1] ?? '';
        const table = node.table;

        // 重新构建 SQL：UPDATE table SET col = ? WHERE (original) AND col = ?
        let newSql = `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(col)} = ?`;
        const newParams: any[] = [deleteVal];

        if (originalWhere) {
          newSql += ` WHERE (${originalWhere}) AND ${quoteIdentifier(col)} = ?`;
        } else {
          newSql += ` WHERE ${quoteIdentifier(col)} = ?`;
        }
        newParams.push(...ctx.params, notDeleteVal);

        ctx.sql = newSql;
        ctx.params = newParams;

      } else if (node.type === 'select') {
        // SELECT → 追加 AND {col} = notDeleteVal
        const condition = `${quoteIdentifier(col)} = ?`;
        if (ctx.sql.includes('WHERE')) {
          ctx.sql = ctx.sql.replace(/WHERE\s+/i, `WHERE ${condition} AND `);
        } else {
          // 在 ORDER BY / GROUP BY / LIMIT 之前插入 WHERE
          ctx.sql = ctx.sql.replace(
            /(ORDER BY|GROUP BY|LIMIT|$)/i,
            (match) => match ? ` WHERE ${condition} ${match}` : ` WHERE ${condition}`
          );
        }
        ctx.params = [notDeleteVal, ...ctx.params];

      } else if (node.type === 'update') {
        // UPDATE → 追加 AND {col} = notDeleteVal，防止更新已删除数据
        const condition = `${quoteIdentifier(col)} = ?`;
        if (ctx.sql.includes('WHERE')) {
          ctx.sql += ` AND ${condition}`;
        } else {
          ctx.sql += ` WHERE ${condition}`;
        }
        ctx.params = [...ctx.params, notDeleteVal];
      }
    },
  };
}

function quoteIdentifier(name: string): string {
  return `\`${name}\``;
}
