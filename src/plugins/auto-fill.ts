import type { Plugin, PluginContext, FillStrategy } from '../types';

export type FillHandler = (fieldName: string, strategy: FillStrategy) => any;

export interface AutoFillOptions {
  handler: FillHandler;
}

/**
 * 自动填充插件
 *
 * INSERT 时填充 fill: 'insert' | 'insertAndUpdate' 的字段
 * UPDATE 时填充 fill: 'update' | 'insertAndUpdate' 的字段
 */
export function createAutoFillPlugin(options: AutoFillOptions): Plugin {
  return {
    name: 'auto-fill',
    order: -90,

    beforeExecute(ctx: PluginContext): void {
      const { entityMeta, node, dialect } = ctx;

      if (node.type === 'insert') {
        const fillCols = entityMeta.columns.filter(
          c => c.exist && c.fill && (c.fill === 'insert' || c.fill === 'insertAndUpdate')
        );
        if (!fillCols.length) return;

        for (const col of fillCols) {
          const value = options.handler(col.propertyName, col.fill!);
          if (value === undefined) continue;

          // 检查列是否已存在（兼容反引号和双引号）
          const alreadyExists =
            ctx.sql.includes(`\`${col.columnName}\``) ||
            ctx.sql.includes(`"${col.columnName}"`) ||
            ctx.sql.includes(` ${col.columnName} `) ||
            ctx.sql.includes(`(${col.columnName})`);

          if (alreadyExists) {
            // 列已在 SQL 中，替换每行中对应位置的 undefined/null 参数
            const colIndex = (node as any).columns?.indexOf(col.columnName);
            if (colIndex == null || colIndex < 0) continue;
            const rowCount = (node as any).values?.length ?? 1;
            const paramsPerRow = rowCount > 0 ? ctx.params.length / rowCount : ctx.params.length;
            for (let i = 0; i < rowCount; i++) {
              const idx = i * paramsPerRow + colIndex;
              if (ctx.params[idx] == null) ctx.params[idx] = value;
            }
            continue;
          }

          const colMatch = ctx.sql.match(/^(INSERT INTO\s+\S+\s*\()([^)]+)(\)\s*VALUES\s*)([\s\S]+)$/i);
          if (!colMatch) continue;

          const [, prefix, cols, valuesKeyword, valuesPart] = colMatch;
          const quotedCol = dialect.quote(col.columnName);

          const rowCount = (valuesPart.match(/\(/g) || []).length;
          const paramsPerRow = rowCount > 0 ? ctx.params.length / rowCount : ctx.params.length;

          // 重建每行占位符并追加新列的值
          const newParams: any[] = [];
          const newRows: string[] = [];
          const newParamsPerRow = paramsPerRow + 1;

          for (let i = 0; i < rowCount; i++) {
            newParams.push(...ctx.params.slice(i * paramsPerRow, (i + 1) * paramsPerRow), value);
            const placeholders: string[] = [];
            for (let j = 0; j < newParamsPerRow; j++) {
              placeholders.push(dialect.placeholder(i * newParamsPerRow + j + 1));
            }
            newRows.push(`(${placeholders.join(', ')})`);
          }

          ctx.sql = `${prefix}${cols}, ${quotedCol}${valuesKeyword}${newRows.join(', ')}`;
          ctx.params = newParams;
        }

      } else if (node.type === 'update') {
        const fillCols = entityMeta.columns.filter(
          c => c.exist && c.fill && (c.fill === 'update' || c.fill === 'insertAndUpdate')
        );
        if (!fillCols.length) return;

        for (const col of fillCols) {
          const value = options.handler(col.propertyName, col.fill!);
          if (value === undefined) continue;

          const quotedCol = dialect.quote(col.columnName);
          const hasWhere = /\bWHERE\b/i.test(ctx.sql);

          if (hasWhere) {
            // 在 WHERE 前插入新的 SET 列，需要重新编号后续占位符
            const whereIdx = ctx.sql.search(/\bWHERE\b/i);
            const beforeWhere = ctx.sql.slice(0, whereIdx);
            const afterWhere = ctx.sql.slice(whereIdx);

            // 计算当前 SET 部分有多少个参数
            const setParamCount = (beforeWhere.match(/\?/g) || []).length +
              ([...beforeWhere.matchAll(/\$(\d+)/g)].length);

            ctx.params.splice(setParamCount, 0, value);

            // 重建 SQL：在 WHERE 前追加新列
            const newPlaceholder = dialect.placeholder(setParamCount + 1);
            const newBeforeWhere = beforeWhere.trimEnd() + `, ${quotedCol} = ${newPlaceholder} `;
            // 偏移 WHERE 后的 $N 占位符
            const newAfterWhere = afterWhere.replace(/\$(\d+)/g, (_, n) => {
              const num = Number(n);
              return num > setParamCount ? `$${num + 1}` : `$${n}`;
            });
            ctx.sql = newBeforeWhere + newAfterWhere;
          } else {
            const paramIdx = ctx.params.length + 1;
            ctx.sql += `, ${quotedCol} = ${dialect.placeholder(paramIdx)}`;
            ctx.params.push(value);
          }
        }
      }
    },
  };
}
