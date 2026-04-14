import type { Plugin, PluginContext } from '../types';

/**
 * 逻辑删除插件
 *
 * 拦截 DELETE → 改写为 UPDATE SET deleted = deleteValue
 * 拦截 SELECT → 自动追加 WHERE deleted = notDeleteValue
 * 拦截 UPDATE → 自动追加 WHERE deleted = notDeleteValue
 *
 * 需要实体上有 @LogicDelete 装饰的字段才会生效
 */
export function createLogicDeletePlugin(): Plugin {
  return {
    name: 'logic-delete',
    order: -100,

    beforeExecute(ctx: PluginContext): void {
      const { entityMeta, node, dialect } = ctx;
      const ldCol = entityMeta.logicDeleteColumn;
      if (!ldCol) return;

      const col = ldCol.columnName;
      const deleteVal = ldCol.logicDeleteValue ?? 1;
      const notDeleteVal = ldCol.logicNotDeleteValue ?? 0;
      const q = (name: string) => dialect.quote(name);
      const usesPositional = dialect.placeholder(1) !== '?';

      if (node.type === 'delete') {
        const table = node.table;
        const whereMatch = ctx.sql.match(/\bWHERE\b\s+([\s\S]+)$/i);
        const originalWhere = whereMatch?.[1] ?? '';

        if (usesPositional) {
          // PG: 重建整个 SQL 用 $N 占位符
          const newParams: any[] = [deleteVal];
          let newSql: string;
          if (originalWhere) {
            const reindexedWhere = reindexPlaceholders(originalWhere, 1);
            newParams.push(...ctx.params, notDeleteVal);
            newSql = `UPDATE ${q(table)} SET ${q(col)} = ${dialect.placeholder(1)} WHERE (${reindexedWhere}) AND ${q(col)} = ${dialect.placeholder(newParams.length)}`;
          } else {
            newParams.push(notDeleteVal);
            newSql = `UPDATE ${q(table)} SET ${q(col)} = ${dialect.placeholder(1)} WHERE ${q(col)} = ${dialect.placeholder(2)}`;
          }
          ctx.sql = newSql;
          ctx.params = newParams;
        } else {
          // MySQL/SQLite: ? 占位符
          const newParams: any[] = [deleteVal];
          let newSql = `UPDATE ${q(table)} SET ${q(col)} = ?`;
          if (originalWhere) {
            newSql += ` WHERE (${originalWhere}) AND ${q(col)} = ?`;
            newParams.push(...ctx.params, notDeleteVal);
          } else {
            newSql += ` WHERE ${q(col)} = ?`;
            newParams.push(notDeleteVal);
          }
          ctx.sql = newSql;
          ctx.params = newParams;
        }

      } else if (node.type === 'select') {
        if (usesPositional) {
          ctx.params = [notDeleteVal, ...ctx.params];
          ctx.sql = reindexPlaceholders(ctx.sql, 1);
          const condition = `${q(col)} = ${dialect.placeholder(1)}`;
          ctx.sql = injectWhereCondition(ctx.sql, condition);
        } else {
          const condition = `${q(col)} = ?`;
          ctx.sql = injectWhereCondition(ctx.sql, condition);
          // 对于 SELECT，? 参数按 SQL 顺序：tenant 条件在 WHERE 最前面
          ctx.params = [notDeleteVal, ...ctx.params];
        }

      } else if (node.type === 'update') {
        if (usesPositional) {
          ctx.params = [...ctx.params, notDeleteVal];
          const paramIdx = ctx.params.length;
          const condition = `${q(col)} = ${dialect.placeholder(paramIdx)}`;
          if (/\bWHERE\b/i.test(ctx.sql)) {
            ctx.sql += ` AND ${condition}`;
          } else {
            ctx.sql += ` WHERE ${condition}`;
          }
        } else {
          // MySQL/SQLite: 追加到 WHERE 末尾，参数也追加到末尾
          const condition = `${q(col)} = ?`;
          if (/\bWHERE\b/i.test(ctx.sql)) {
            ctx.sql += ` AND ${condition}`;
          } else {
            ctx.sql += ` WHERE ${condition}`;
          }
          ctx.params = [...ctx.params, notDeleteVal];
        }
      }
    },
  };
}

function injectWhereCondition(sql: string, condition: string): string {
  if (/\bWHERE\b/i.test(sql)) {
    return sql.replace(/\bWHERE\b/i, `WHERE ${condition} AND`);
  }
  const match = /\b(ORDER BY|GROUP BY|LIMIT)\b/i.exec(sql);
  if (match) {
    return sql.slice(0, match.index).trimEnd() + ` WHERE ${condition} ` + sql.slice(match.index);
  }
  return sql + ` WHERE ${condition}`;
}

function reindexPlaceholders(sql: string, offset: number): string {
  return sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
}
