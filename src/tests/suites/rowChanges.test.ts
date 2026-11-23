import { expect, test } from 'vitest';
import { UpdatableInfo } from '../../views/html/dataTable';
import { inlineParameters } from '../../views/results/parameterInfo';
import { buildDeleteStatement, selectListIncludes, sqlName } from '../../views/results/rowChanges';

const byRrn: UpdatableInfo = {
  table: `SAMPLE.EMPLOYEE`,
  columns: [
    { name: `RRN`, jsType: `number`, isNullable: false, useInWhere: true, insertable: false },
    { name: `EMPNO`, jsType: `asString`, isNullable: false, useInWhere: false },
    { name: `SALARY`, jsType: `number`, isNullable: true, useInWhere: false },
  ],
};

const byIdentity: UpdatableInfo = {
  table: `SAMPLE.ORDERS`,
  columns: [
    { name: `ID`, jsType: `number`, isNullable: false, useInWhere: true, insertable: false },
    { name: `ITEM`, jsType: `asString`, isNullable: true, useInWhere: false },
  ],
};

test('A row is deleted by its RRN', () => {
  expect(buildDeleteStatement(byRrn, [`RRN`, `EMPNO`, `SALARY`], [7, `000010`, 5000])).toEqual({
    statement: `DELETE FROM SAMPLE.EMPLOYEE t WHERE RRN(t) = ?`,
    bindings: [7],
  });
});

test('A row is deleted by its identity column, wherever it is in the result', () => {
  expect(buildDeleteStatement(byIdentity, [`ITEM`, `ID`], [`Pen`, `42`])).toEqual({
    statement: `DELETE FROM SAMPLE.ORDERS t WHERE ID = ?`,
    bindings: [`42`],
  });
});

test('A row with a null key cannot be deleted, as IS NULL could match many rows', () => {
  const nullableKey: UpdatableInfo = { table: `S.T`, columns: [{ name: `CODE`, jsType: `asString`, isNullable: true, useInWhere: true }] };
  expect(buildDeleteStatement(nullableKey, [`CODE`], [null])).toBeUndefined();
  expect(buildDeleteStatement(nullableKey, [`CODE`], [undefined])).toBeUndefined();
});

test('Numeric key text is bound unchanged, so large BIGINT and DECIMAL keys keep every digit', () => {
  expect(buildDeleteStatement(byIdentity, [`ID`], [`9007199254740993`])!.bindings).toEqual([`9007199254740993`]);
  expect(buildDeleteStatement(byIdentity, [`ID`], [`12345678901234567890.12`])!.bindings).toEqual([`12345678901234567890.12`]);
});

test('Key columns with delimited names are quoted', () => {
  const delimited: UpdatableInfo = {
    table: `S.T`,
    columns: [
      { name: `id`, jsType: `number`, isNullable: false, useInWhere: true },
      { name: `Order No`, jsType: `asString`, isNullable: false, useInWhere: true },
    ],
  };
  expect(buildDeleteStatement(delimited, [`id`, `Order No`], [1, `A1`])).toEqual({
    statement: `DELETE FROM S.T t WHERE "id" = ? AND "Order No" = ?`,
    bindings: [1, `A1`],
  });
});

test('Names Db2 folds to upper case are left unquoted', () => {
  expect(sqlName(`EMPNO`)).toBe(`EMPNO`);
  expect(sqlName(`#CODE$`)).toBe(`#CODE$`);
  expect(sqlName(`empno`)).toBe(`"empno"`);
  expect(sqlName(`A"B`)).toBe(`"A""B"`);
});

test('A select list returns a key column only when it names it or uses *', () => {
  expect(selectListIncludes(undefined, `ID`)).toBe(true);
  expect(selectListIncludes(` * `, `ID`)).toBe(true);
  expect(selectListIncludes(` t.*, x `, `ID`)).toBe(true);
  expect(selectListIncludes(` NAME `, `ID`)).toBe(false);
  expect(selectListIncludes(` NAME, IDX `, `ID`)).toBe(false);
  expect(selectListIncludes(` NAME, t.id `, `ID`)).toBe(true);
  expect(selectListIncludes(` NAME, "ID" `, `ID`)).toBe(true);
  expect(selectListIncludes(` "id", NAME `, `id`)).toBe(true);
  expect(selectListIncludes(` ID, NAME `, `id`)).toBe(false);
});

const byPrimaryKey: UpdatableInfo = {
  table: `SAMPLE.EMPPROJACT`,
  columns: [
    { name: `EMPNO`, jsType: `asString`, isNullable: false, useInWhere: true },
    { name: `PROJNO`, jsType: `asString`, isNullable: false, useInWhere: true },
    { name: `EMPTIME`, jsType: `number`, isNullable: true, useInWhere: false },
  ],
};

test('A row is deleted by every column of its primary key', () => {
  expect(buildDeleteStatement(byPrimaryKey, [`EMPNO`, `PROJNO`, `EMPTIME`], [`000010`, `MA2100`, 0.5])).toEqual({
    statement: `DELETE FROM SAMPLE.EMPPROJACT t WHERE EMPNO = ? AND PROJNO = ?`,
    bindings: [`000010`, `MA2100`],
  });
});

test('A row missing one column of its key cannot be deleted, as other rows could match', () => {
  expect(buildDeleteStatement(byPrimaryKey, [`EMPNO`, `EMPTIME`], [`000010`, 0.5])).toBeUndefined();
});

test('A row without its key column in the result cannot be deleted', () => {
  expect(buildDeleteStatement(byIdentity, [`ITEM`], [`Pen`])).toBeUndefined();
});

test('The confirmation shows the statement with its values', () => {
  const sql = buildDeleteStatement(byIdentity, [`ID`, `ITEM`], [42, `Pen`])!;
  expect(inlineParameters(sql.statement, sql.bindings)).toBe(`DELETE FROM SAMPLE.ORDERS t WHERE ID = 42`);
});
