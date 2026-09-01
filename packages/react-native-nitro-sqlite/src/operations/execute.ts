import { HybridNitroSQLite } from '../nitro'
import type {
  QueryResult,
  QueryResultRow,
  SQLiteQueryParams,
  SQLiteValue,
} from '../types'
import NitroSQLiteError from '../NitroSQLiteError'
import type { NitroSQLiteQueryResult } from '../specs/NitroSQLiteQueryResult.nitro'

export function execute<Row extends QueryResultRow = never>(
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

export async function executeAsync<Row extends QueryResultRow = never>(
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

export function executeRaw(
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

export async function executeRawAsync(
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

function buildJSQueryResult<Row extends QueryResultRow = never>(
  result: NitroSQLiteQueryResult,
): QueryResult<Row> {
  const resultWithRows = result as QueryResult<Row>

  resultWithRows.rows = {
    _array: result.results as Row[],
    length: result.results.length,
    item: (idx: number) => result.results[idx] as Row | undefined,
  }

  return resultWithRows
}
