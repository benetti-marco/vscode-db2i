import type { UpdatableInfo } from "../html/dataTable";
import type { SqlParameter } from "./resultSetPanelProvider";

/** Row action ids of an updatable result set. Each needs a `webview/context` entry on `dtAction_<id>`. */
export const RESULT_ROW_ACTIONS = {
  delete: `resultDeleteRow`,
};

const ORDINARY_NAME = /^[A-Z_#@$][A-Z0-9_#@$]*$/;

/** A column name as SQL text: names Db2 folds to upper case need no quotes, others are delimited */
export function sqlName(name: string): string {
  return ORDINARY_NAME.test(name) ? name : `"${name.replace(/"/g, `""`)}"`;
}

/**
 * Whether the select list of a statement returns a column, so it can be used to identify rows.
 * `selectList` is the text between `select` and `from`; undefined when there is none, which returns every column.
 */
export function selectListIncludes(selectList: string | undefined, name: string): boolean {
  if (selectList === undefined) return true;

  // `*` or `t.*` returns every column
  if (selectList.split(`,`).some(item => /^\s*(?:[^\s,]+\.)?\*\s*$/.test(item))) return true;

  if (ORDINARY_NAME.test(name)) {
    // Ordinary names are case insensitive, and may be written delimited too
    return new RegExp(`(^|[^A-Z0-9_#@$"])${name.replace(/[$]/g, `\\$`)}([^A-Z0-9_#@$"]|$)`, `i`).test(selectList)
      || selectList.includes(`"${name}"`);
  }

  return selectList.includes(sqlName(name));
}

/** Builds the `DELETE` for one result row, keyed like a cell update (primary or unique key, identity column or RRN). Undefined when the result lacks a key value. */
export function buildDeleteStatement(updatable: UpdatableInfo, columnNames: string[], row: unknown[]): { statement: string; bindings: SqlParameter[] } | undefined {
  const keyColumns = updatable.columns.filter(column => column.useInWhere);
  const useRrn = keyColumns.length === 1 && keyColumns[0].name === `RRN`;
  const conditions: string[] = [];
  const bindings: SqlParameter[] = [];

  for (const keyColumn of keyColumns) {
    // Without every key column the WHERE could match other rows too
    const index = columnNames.indexOf(keyColumn.name);
    if (index < 0) return undefined;

    // A null key does not identify one row: `IS NULL` could match many
    const value = row[index];
    if (value === null || value === undefined) return undefined;

    conditions.push(`${useRrn ? `RRN(t)` : sqlName(keyColumn.name)} = ?`);
    // Numbers stay as they came; numeric text is bound as text, as Number() would round large BIGINT and DECIMAL values
    bindings.push(keyColumn.jsType === `number` && typeof value === `number` ? value : String(value));
  }

  // Never send a DELETE that would hit every row
  if (conditions.length === 0) return undefined;

  return { statement: `DELETE FROM ${updatable.table} t WHERE ${conditions.join(` AND `)}`, bindings };
}
