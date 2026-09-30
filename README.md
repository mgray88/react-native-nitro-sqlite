<a href="https://sqlite.margelo.com/docs">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/img/banner-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="./assets/img/banner-light.png" />
    <img alt="Nitro SQLite" src="./assets/img/banner-light.png" />
  </picture>
</a>

<br />

Nitro SQLite is a SQLite library for React Native on iOS, macOS, visionOS, and Android, built with [Nitro Modules](https://nitro.margelo.com/). It provides synchronous and asynchronous queries, transactions, and batch operations.

**[Read the documentation](https://sqlite.margelo.com/docs)** for setup, guides, integrations, and the API reference.

If you use a coding agent, give it the [NitroSQLite skill](https://github.com/margelo/react-native-skills/blob/nitro-sqlite/skills/react-native-nitro-sqlite/SKILL.md). It links to focused guidance for connections, queries, transactions, concurrency, and migration. See the [AI agent guide](https://sqlite.margelo.com/docs/guides/ai-agents) for what to check in generated code.

## Installation

Requires React Native 0.75 or newer and `react-native-nitro-modules` 0.37.1 or newer.

```sh
npm install react-native-nitro-sqlite react-native-nitro-modules
```

Native API additions require rebuilding the iOS and Android application. Do not call a newly added native method from an OTA JavaScript update running against an older binary. Expo projects need a development build; Expo Go cannot load this native module. See [Getting Started](https://sqlite.margelo.com/docs) for details.

---

## Example

```ts
import { open } from 'react-native-nitro-sqlite'

const db = open({ name: 'app.sqlite' })
db.execute('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)')
db.execute('INSERT INTO notes (body) VALUES (?)', ['Hello'])

const { rows } = db.execute<{ id: number; body: string }>(
  'SELECT id, body FROM notes',
)
console.log(rows._array)

db.close()
```

## Positional query results

Use `db.executeRaw(query, params?)` or `db.executeRawAsync(query, params?)` when you need SQLite's column order or queries with duplicate column labels. Both return `SQLiteValue[][]`; each inner array is one row, in SQL result-column order. Unlike keyed `execute()` results, positional rows retain every column when labels repeat.

```ts
const rows = db.executeRaw('SELECT 1 AS id, 2 AS id')
// [[1, 2]]
const laterRows = await db.executeRawAsync('SELECT id, title FROM notes WHERE id = ?', [1])
```

Raw methods accept the same bound parameters as `execute`. They are methods on a database connection and on the database-name-based `NitroSQLite` facade, but are not transaction-object methods. Do not await `db.executeRawAsync()` inside `db.transaction()` on the same connection: its queued work cannot run until the transaction callback finishes. Use the callback's `tx.executeAsync()` for transaction-scoped queries; its result remains keyed by column label.

After adding a native API, rebuild the iOS or Android app before calling it. An OTA JavaScript update cannot add a method to an older native binary. Expo Go is unsupported; use an Expo development build.

If you implement `NitroSQLiteConnection` structurally, update the implementation or mock to provide `executeRaw` and `executeRawAsync` as well.

## Migrating from Quick SQLite

`react-native-quick-sqlite` 8.x was succeeded by `react-native-nitro-sqlite` 9.x. Follow the [migration guide](https://sqlite.margelo.com/docs/guides/migrate-from-quick-sqlite) before updating an app with existing database files.

## Community and contributing

Join the [Margelo Community Discord](https://discord.gg/6CSHz2qAvA). Contributions are welcome through [issues](https://github.com/margelo/react-native-nitro-sqlite/issues) and pull requests.

## License

---

# Vector search (sqlite-vec)

Vector search is an opt-in companion package. It statically links sqlite-vec into Nitro SQLite's SQLite build—there is no runtime extension loading.

1. Install the companion package:
   ```bash
   npm install react-native-nitro-sqlite-vec
   ```
2. Enable it for each native platform, then rebuild the app:
   - **iOS:** run CocoaPods with `NITRO_SQLITE_VEC=1`, for example:
     ```bash
     NITRO_SQLITE_VEC=1 npx pod-install
     ```
   - **Android:** add this to `android/gradle.properties`:
     ```properties
     nitroSqliteVec=true
     ```

The companion exports small typed helpers. Its full API is also documented in [the package README](./packages/react-native-nitro-sqlite-vec/README.md).

```ts
import { open } from 'react-native-nitro-sqlite'
import {
  createVectorTable,
  isVecAvailable,
  knnSearch,
  vecVersion,
} from 'react-native-nitro-sqlite-vec'

const db = open({ name: 'vectors.sqlite' })

if (!isVecAvailable(db)) {
  throw new Error('sqlite-vec is not enabled in this build')
}

console.log(vecVersion(db))
createVectorTable(db, 'embeddings', { dimensions: 3 })
db.execute('INSERT INTO embeddings (rowid, embedding) VALUES (?, ?)', [
  1,
  '[0.1, 0.2, 0.3]',
])

const matches = knnSearch(db, 'embeddings', [0.1, 0.2, 0.25], 10)
```

The helper APIs interpolate table and column names into SQL; use trusted identifiers only.

---

# TypeORM

You can use this package as a TypeORM driver. Because of Metro and Node resolution, TypeORM’s `package.json` must be exposed and the driver aliased.

1. **Expose TypeORM `package.json`** (in TypeORM’s `package.json` `exports` add `"./package.json": "./package.json"`), then:
   ```sh
   npx patch-package --exclude 'nothing' typeorm
   ```
2. **Alias the driver** in `babel.config.js`:
   ```js
   plugins: [
     [
       'module-resolver',
       {
         alias: {
           'react-native-sqlite-storage': 'react-native-nitro-sqlite',
         },
       },
     ],
   ]
   ```
   Install: `npm i -D babel-plugin-module-resolver`
3. **Use the driver**:
   ```ts
   import { typeORMDriver } from 'react-native-nitro-sqlite'

   const datasource = new DataSource({
     type: 'react-native',
     database: 'typeormdb',
     location: '.',
     driver: typeORMDriver,
     entities: [...],
     synchronize: true,
   })
   ```

---

# Configuration

## Use system SQLite on iOS

To use the system SQLite instead of the bundled one:

```bash
NITRO_SQLITE_USE_PHONE_VERSION=1 npx pod-install
```

## Compile-time options (e.g. FTS5, Geopoly)

**iOS** — in your app’s `ios/Podfile`, in a `post_install` block:

```ruby
installer.pods_project.targets.each do |target|
  if target.name == "RNNitroSQLite"
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'SQLITE_ENABLE_FTS5=1'
    end
  end
end
```

**Android** — in `android/gradle.properties`:

```properties
nitroSqliteFlags="-DSQLITE_ENABLE_FTS5=1"
```

## App groups (iOS)

To put the database in an app group (e.g. for extensions), set `RNNitroSQLite_AppGroup` in your `Info.plist` to the app group ID and add the App Groups capability in Xcode.

---

# Exports

```typescript
import {
  open,
  NitroSQLite,
  NitroSQLiteError,
  typeORMDriver,
} from 'react-native-nitro-sqlite'
import type {
  BatchQueryCommand,
  BatchQueryResult,
  FileLoadResult,
  NitroSQLiteConnection,
  QueryResult,
  SQLiteValue,
  Transaction,
} from 'react-native-nitro-sqlite'
```

`open()` is the recommended API. `NitroSQLite` exposes the underlying database-name-based methods—including `executeRaw` and `executeRawAsync`—for advanced integrations; prefer the connection returned by `open()` because it binds the database name and adds the JavaScript transaction and result helpers. `NitroSQLite.native` exposes the generated native methods, including `executeRaw` and `executeRawAsync` without JavaScript error normalization. Implementations of the exported `NitroSQLiteConnection` interface, such as structural mocks or wrappers, must provide both raw methods.

```typescript
const rows = NitroSQLite.executeRaw('myDb.sqlite', 'SELECT 1, 2')
const nativeRows = NitroSQLite.native.executeRaw('myDb.sqlite', 'SELECT 1, 2')
```

---

# Community

[Join the Margelo Community Discord](https://discord.gg/6CSHz2qAvA)

# License

MIT License.
