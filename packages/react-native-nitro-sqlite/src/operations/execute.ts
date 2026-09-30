import { HybridNitroSQLite } from '../nitro'
import type {
  QueryResult,
  QueryResultRow,
  SQLiteQueryParams,
  SQLiteValue,
} from '../types'
import NitroSQLiteError from '../NitroSQLiteError'
import type { NitroSQLiteQueryResult } from '../specs/NitroSQLiteQueryResult.nitro'
import {
  isDatabaseOpen,
  queueStatementAsync,
  startOperationSync,
} from '../DatabaseQueue'
import type { DatabaseQueueKey } from '../DatabaseQueue'

/** Execute one SQL statement synchronously by database name.
 * Uses the managed queue when the database has an open managed connection.
 * @param dbName Name of an open native database.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @returns The query result with typed rows.
 */
export function execute<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): QueryResult<Row> {
  if (!isDatabaseOpen(dbName)) {
    return executeNative(dbName, query, params)
  }

  return executeManaged(dbName, query, params)
}

export function executeManaged<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
  queueKey: DatabaseQueueKey = dbName,
): QueryResult<Row> {
  return startOperationSync(queueKey, () =>
    executeNative(dbName, query, params),
  )
}

export function executeNative<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): QueryResult<Row> {
  try {
    const nativeResult = HybridNitroSQLite.execute(dbName, query, params)
    return buildJSQueryResult<Row>(nativeResult)
  } catch (error) {
    throw NitroSQLiteError.fromError(error)
  }
}

/** Execute one SQL statement asynchronously by database name.
 * Uses the managed queue when the database has an open managed connection.
 * @param dbName Name of an open native database.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @returns A promise of the query result with typed rows.
 */
export async function executeAsync<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): Promise<QueryResult<Row>> {
  if (!isDatabaseOpen(dbName)) {
    return executeAsyncNative(dbName, query, params)
  }

  return executeAsyncManaged(dbName, query, params)
}

export async function executeAsyncManaged<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
  queueKey: DatabaseQueueKey = dbName,
): Promise<QueryResult<Row>> {
  return queueStatementAsync(queueKey, () =>
    executeAsyncNative(dbName, query, params),
  )
}

export async function executeAsyncNative<Row extends QueryResultRow = never>(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): Promise<QueryResult<Row>> {
  try {
    const nativeResult = await HybridNitroSQLite.executeAsync(
      dbName,
      query,
      params,
    )
    return buildJSQueryResult<Row>(nativeResult)
  } catch (error) {
    throw NitroSQLiteError.fromError(error)
  }
}

/** Execute a statement synchronously by database name and return positional rows.
 * When the default managed connection is open, runs through its operation queue.
 * @param dbName Name of the database to query.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @returns Rows as nested vectors in SQLite column order.
 */
export function executeRaw(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): SQLiteValue[][] {
  if (!isDatabaseOpen(dbName)) {
    return executeRawNative(dbName, query, params)
  }

  return executeRawManaged(dbName, query, params)
}

/** Execute a raw statement synchronously through its managed operation queue.
 * @param dbName Name or native ID of the connection to query.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @param queueKey Identity of the connection's managed queue.
 * @returns Rows as nested vectors in SQLite column order.
 */
export function executeRawManaged(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
  queueKey: DatabaseQueueKey = dbName,
): SQLiteValue[][] {
  return startOperationSync(queueKey, () =>
    executeRawNative(dbName, query, params),
  )
}

function executeRawNative(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): SQLiteValue[][] {
  try {
    return HybridNitroSQLite.executeRaw(dbName, query, params)
  } catch (error) {
    throw NitroSQLiteError.fromError(error)
  }
}

/** Queue an asynchronous statement by database name and return positional rows.
 * When the default managed connection is open, this joins its FIFO operation queue.
 * @param dbName Name of the database to query.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @returns A promise of rows in SQLite column order.
 */
export async function executeRawAsync(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): Promise<SQLiteValue[][]> {
  if (!isDatabaseOpen(dbName)) {
    return executeRawAsyncNative(dbName, query, params)
  }

  return executeRawAsyncManaged(dbName, query, params)
}

/** Queue a raw statement on its managed connection.
 * @param dbName Name or native ID of the connection to query.
 * @param query SQL statement with optional positional placeholders.
 * @param params Values bound to the placeholders.
 * @param queueKey Identity of the connection's managed queue.
 * @returns A promise of rows in SQLite column order.
 */
export function executeRawAsyncManaged(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
  queueKey: DatabaseQueueKey = dbName,
): Promise<SQLiteValue[][]> {
  return queueStatementAsync(queueKey, () =>
    executeRawAsyncNative(dbName, query, params),
  )
}

async function executeRawAsyncNative(
  dbName: string,
  query: string,
  params?: SQLiteQueryParams,
): Promise<SQLiteValue[][]> {
  try {
    return await HybridNitroSQLite.executeRawAsync(dbName, query, params)
  } catch (error) {
    throw NitroSQLiteError.fromError(error)
  }
}

export function buildJSQueryResult<Row extends QueryResultRow = never>(
  result: NitroSQLiteQueryResult,
): QueryResult<Row> {
  const resultWithRows = result as QueryResult<Row>
  const results = result.results as Row[]

  resultWithRows.rows = {
    _array: results,
    length: results.length,
    item: (idx: number) => results[idx],
  }

  return resultWithRows
}
