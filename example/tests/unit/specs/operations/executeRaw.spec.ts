import { describe, it } from '@tests/TestApi'
import { expect, isNitroSQLiteError } from '@tests/unit/common'
import { TEST_DB_NAME, testDb } from '@tests/db'
import { NitroSQLite, open } from 'react-native-nitro-sqlite'
import type { SQLiteValue } from 'react-native-nitro-sqlite'

export default function registerExecuteRawUnitTests() {
  describe('executeRaw', () => {
    it('preserves duplicate labels while execute keeps its object shape', () => {
      expect(testDb.executeRaw('SELECT 1 AS id, 2 AS id')).toEqual([[1, 2]])
      expect(testDb.execute('SELECT 1 AS id, 2 AS id').results).toEqual([
        { id: 2 },
      ])
    })

    it('preserves joined values and SQL column order', () => {
      testDb.execute('CREATE TABLE lhs (id INTEGER, value TEXT)')
      testDb.execute('CREATE TABLE rhs (id INTEGER, value TEXT)')
      testDb.execute('INSERT INTO lhs VALUES (?, ?)', [1, 'left'])
      testDb.execute('INSERT INTO rhs VALUES (?, ?)', [2, 'right'])

      expect(
        testDb.executeRaw(
          'SELECT lhs.id, rhs.id, rhs.value, lhs.value FROM lhs JOIN rhs ON 1 = 1',
        ),
      ).toEqual([[1, 2, 'right', 'left']])
    })

    it('preserves repeated aliases, nulls, row order, and column order', () => {
      expect(
        testDb.executeRaw(
          "SELECT 1 AS value, NULL AS value, 'three' AS value UNION ALL SELECT 4, 5, 6",
        ),
      ).toEqual([
        [1, null, 'three'],
        [4, 5, 6],
      ])
    })

    it('accepts bound parameters in positional order', async () => {
      const expected = [1, 'text', null]
      const query = 'SELECT ? AS first, ? AS second, ? AS third'

      expect(testDb.executeRaw(query, [true, 'text', null])).toEqual([expected])
      expect(await testDb.executeRawAsync(query, [true, 'text', null])).toEqual(
        [expected],
      )
    })

    it('binds undefined as NULL and preserves embedded NUL text', async () => {
      const query = 'SELECT ? AS missing, ? AS text'
      const params = [undefined, 'before\u0000after']
      const expected = [[null, 'before\u0000after']]

      expect(testDb.executeRaw(query, params)).toEqual(expected)
      expect(await testDb.executeRawAsync(query, params)).toEqual(expected)
    })

    it('works on an independent connection to the same database', async () => {
      const independentDb = open({
        name: TEST_DB_NAME,
        connection: 'independent',
      })

      try {
        expect(independentDb.executeRaw('SELECT 1 AS id, 2 AS id')).toEqual([
          [1, 2],
        ])
        expect(
          await independentDb.executeRawAsync('SELECT 3 AS id, 4 AS id'),
        ).toEqual([[3, 4]])
      } finally {
        independentDb.close()
      }
    })

    it('matches execute value conversions, including blobs', async () => {
      const result = testDb.executeRaw(
        "SELECT 'text', 42, NULL, x'010203', x''",
      )
      expect(result[0]?.slice(0, 3)).toEqual(['text', 42, null])
      expect(Array.from(new Uint8Array(result[0]?.[3] as ArrayBuffer))).toEqual(
        [1, 2, 3],
      )
      expect((result[0]?.[4] as ArrayBuffer).byteLength).toBe(0)

      const asyncResult = await testDb.executeRawAsync(
        "SELECT 'text', 42, NULL, x'010203', x''",
      )
      expect(
        Array.from(new Uint8Array(asyncResult[0]?.[3] as ArrayBuffer)),
      ).toEqual([1, 2, 3])
      expect((asyncResult[0]?.[4] as ArrayBuffer).byteLength).toBe(0)
    })

    it('returns no rows for statements without result rows', () => {
      expect(
        testDb.executeRaw('UPDATE User SET name = ? WHERE id = ?', [
          'missing',
          -1,
        ]),
      ).toEqual([])
      expect(
        testDb.executeRaw('SELECT * FROM User WHERE id = ?', [-1]),
      ).toEqual([])
    })

    it('exposes normalized errors through sync and async public wrappers', async () => {
      let syncThrew = false
      try {
        testDb.executeRaw('SELECT * FROM missing_table')
      } catch (error) {
        syncThrew = true
        expect(isNitroSQLiteError(error)).toBe(true)
      }
      expect(syncThrew).toBe(true)

      let asyncThrew = false
      try {
        await testDb.executeRawAsync('SELECT * FROM missing_table')
      } catch (error) {
        asyncThrew = true
        expect(isNitroSQLiteError(error)).toBe(true)
      }
      expect(asyncThrew).toBe(true)

      const closedDb = NitroSQLite.open({ name: 'execute_raw_closed' })
      closedDb.close()
      let closedThrew = false
      try {
        closedDb.executeRaw('SELECT 1')
      } catch (error) {
        closedThrew = true
        expect(isNitroSQLiteError(error)).toBe(true)
      }
      expect(closedThrew).toBe(true)
      closedDb.delete()
    })

    it('works through database-name and connection-bound APIs', async () => {
      const sync: SQLiteValue[][] = NitroSQLite.executeRaw(
        TEST_DB_NAME,
        'SELECT 1, 2',
      )
      const asyncResult: Promise<SQLiteValue[][]> = NitroSQLite.executeRawAsync(
        TEST_DB_NAME,
        'SELECT 1, 2',
      )

      expect(sync).toEqual([[1, 2]])
      expect(await asyncResult).toEqual(sync)
      expect(testDb.executeRaw('SELECT 1, 2')).toEqual(sync)
    })
  })
}
