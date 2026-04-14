import type { Plugin, PluginContext } from '../types';

export interface MultiTenantOptions {
  getTenantId: () => any | Promise<any>;
  tenantColumn?: string;
  ignoreTables?: string[];
  fillOnInsert?: boolean;
}

/**
 * 多租户插件
 *
 * SELECT/UPDATE/DELETE → 自动追加 WHERE tenant_id = ?
 * INSERT → 自动填充 tenant_id 列
 */
export function createMultiTenantPlugin(options: MultiTenantOptions): Plugin {
  const tenantCol = options.tenantColumn ?? 'tenant_id';
  const ignoreTables = new Set(options.ignoreTables ?? []);
  const fillOnInsert = options.fillOnInsert ?? true;

  return {
    name: 'multi-tenant',
    order: -80,

    async beforeExecute(ctx: PluginContext): Promise<void> {
      const { node, dialect } = ctx;

      if (ignoreTables.has(node.table)) return;

      const tenantId = await options.getTenantId();
      if (tenantId == null) return;

      const quotedCol = dialect.quote(tenantCol);
      const usesPositional = dialect.placeholder(1) !== '?';

      if (node.type === 'select' || node.type === 'update' || node.type === 'delete') {
        if (usesPositional) {
          // PG: $N 占位符，参数放最前面，重编号已有占位符
          ctx.params = [tenantId, ...ctx.params];
          ctx.sql = reindexPlaceholders(ctx.sql, 1);
          const condition = `${quotedCol} = ${dialect.placeholder(1)}`;
          ctx.sql = injectWhereCondition(ctx.sql, condition);
        } else {
          // MySQL/SQLite: ? 占位符，参数追加到末尾，条件也追加到 WHERE 末尾
          const condition = `${quotedCol} = ?`;
          if (/\bWHERE\b/i.test(ctx.sql)) {
            ctx.sql = ctx.sql.replace(/\bWHERE\b/i, `WHERE ${condition} AND`);
          } else {
            const match = /\b(ORDER BY|GROUP BY|LIMIT)\b/i.exec(ctx.sql);
            if (match) {
              ctx.sql = ctx.sql.slice(0, match.index).trimEnd() + ` WHERE ${condition} ` + ctx.sql.slice(match.index);
            } else {
              ctx.sql += ` WHERE ${condition}`;
            }
          }
          // 对于 ? 占位符，tenant 条件在 WHERE 最前面，参数也要在 WHERE 参数最前面
          // 找到 SET 部分的参数数量（UPDATE 场景）
          if (node.type === 'update') {
            const setPartMatch = ctx.sql.match(/\bSET\b([\s\S]*?)\bWHERE\b/i);
            const setParamCount = setPartMatch ? (setPartMatch[1].match(/\?/g) || []).length : 0;
            ctx.params.splice(setParamCount, 0, tenantId);
          } else {
            // SELECT/DELETE: 没有 SET 参数，tenant 参数在最前面
            ctx.params = [tenantId, ...ctx.params];
          }
        }

      } else if (node.type === 'insert' && fillOnInsert) {
        if (ctx.sql.includes(tenantCol)) {
          // 列已在 SQL 中，替换每行中对应位置的 undefined/null 参数
          const colIndex = (node as any).columns?.indexOf(tenantCol);
          if (colIndex != null && colIndex >= 0) {
            const rowCount = (node as any).values?.length ?? 1;
            const paramsPerRow = rowCount > 0 ? ctx.params.length / rowCount : ctx.params.length;
            for (let i = 0; i < rowCount; i++) {
              const idx = i * paramsPerRow + colIndex;
              if (ctx.params[idx] == null) ctx.params[idx] = tenantId;
            }
          }
          return;
        }

        const colMatch = ctx.sql.match(/^(INSERT INTO\s+\S+\s*\()([^)]+)(\)\s*VALUES\s*)([\s\S]+)$/i);
        if (!colMatch) return;

        const [, prefix, cols, valuesKeyword, valuesPart] = colMatch;

        const rowCount = (valuesPart.match(/\(/g) || []).length;
        const paramsPerRow = rowCount > 0 ? ctx.params.length / rowCount : ctx.params.length;

        const newParams: any[] = [];
        const newRows: string[] = [];
        const newParamsPerRow = paramsPerRow + 1;

        for (let i = 0; i < rowCount; i++) {
          newParams.push(...ctx.params.slice(i * paramsPerRow, (i + 1) * paramsPerRow), tenantId);
          const placeholders: string[] = [];
          for (let j = 0; j < newParamsPerRow; j++) {
            placeholders.push(dialect.placeholder(i * newParamsPerRow + j + 1));
          }
          newRows.push(`(${placeholders.join(', ')})`);
        }

        ctx.sql = `${prefix}${cols}, ${quotedCol}${valuesKeyword}${newRows.join(', ')}`;
        ctx.params = newParams;
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
