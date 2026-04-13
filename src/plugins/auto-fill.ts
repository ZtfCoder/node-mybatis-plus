import type { Plugin, PluginContext, FillStrategy } from '../types';

export type FillHandler = (fieldName: string, strategy: FillStrategy) => any;

export interface AutoFillOptions {
  /**
   * 填充处理器，根据字段名和填充策略返回要填充的值
   * @example
   * handler: (field, strategy) => {
   *   if (field === 'createTime' || field === 'updateTime') return new Date();
   *   if (field === 'createBy') return getCurrentUserId();
   * }
   */
  handler: FillHandler;
}

/**
 * 自动填充插件
 *
 * 在 INSERT 时填充 fill: 'insert' | 'insertAndUpdate' 的字段
 * 在 UPDATE 时填充 fill: 'update' | 'insertAndUpdate' 的字段
 *
 * 需要实体上有 @TableField({ fill: '...' }) 装饰的字段才会生效
 */
export function createAutoFillPlugin(options: AutoFillOptions): Plugin {
  return {
    name: 'auto-fill',
    order: -90,

    beforeExecute(ctx: PluginContext): void {
      const { entityMeta, node } = ctx;

      if (node.type === 'insert') {
        const fillCols = entityMeta.columns.filter(
          c => c.exist && c.fill && (c.fill === 'insert' || c.fill === 'insertAndUpdate')
        );
        if (!fillCols.length) return;

        for (const col of fillCols) {
          const value = options.handler(col.propertyName, col.fill!);
          if (value === undefined) continue;

          // 检查该列是否已在 INSERT 语句中
          const quotedCol = `\`${col.columnName}\``;
          const doubleQuotedCol = `"${col.columnName}"`;

          if (!ctx.sql.includes(quotedCol) && !ctx.sql.includes(doubleQuotedCol) && !ctx.sql.includes(col.columnName)) {
            // 列不存在，追加到 INSERT 的列列表和 VALUES 中
            // INSERT INTO `table` (`col1`, `col2`) VALUES (?, ?)
            ctx.sql = ctx.sql.replace(
              /\(([^)]+)\)\s+VALUES\s+\(([^)]+)\)/i,
              (_, cols, vals) => `(${cols}, \`${col.columnName}\`) VALUES (${vals}, ?)`
            );
            ctx.params.push(value);
          }
        }

      } else if (node.type === 'update') {
        const fillCols = entityMeta.columns.filter(
          c => c.exist && c.fill && (c.fill === 'update' || c.fill === 'insertAndUpdate')
        );
        if (!fillCols.length) return;

        for (const col of fillCols) {
          const value = options.handler(col.propertyName, col.fill!);
          if (value === undefined) continue;

          // 追加到 SET 子句
          // UPDATE `table` SET `col1` = ? WHERE ...
          ctx.sql = ctx.sql.replace(
            /SET\s+(.+?)\s+WHERE/i,
            (_, sets) => `SET ${sets}, \`${col.columnName}\` = ? WHERE`
          );
          // 找到 WHERE 之前的参数位置插入
          const whereIndex = ctx.sql.toLowerCase().indexOf(' where ');
          if (whereIndex === -1) {
            // 没有 WHERE，直接追加
            ctx.sql = ctx.sql.replace(/SET\s+(.+)$/i, (_, sets) => `SET ${sets}, \`${col.columnName}\` = ?`);
            ctx.params.push(value);
          } else {
            // 计算 SET 部分的参数数量，在 WHERE 参数之前插入
            const setParamCount = (ctx.sql.slice(0, whereIndex).match(/\?/g) || []).length;
            ctx.params.splice(setParamCount, 0, value);
          }
        }
      }
    },
  };
}
