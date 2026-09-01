#include "operations.hpp"
#include "NitroSQLiteException.hpp"
#include "hybridObjects/HybridNitroSQLiteQueryResult.hpp"
#include "logs.hpp"
#include "utils.hpp"
#include <NitroModules/ArrayBuffer.hpp>
#include <cmath>
#include <ctime>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <sqlite3.h>
#include <sstream>
#include <unistd.h>

#ifdef NITRO_SQLITE_VEC
// Angle-bracket so it resolves via -I (CocoaPods intercepts quoted includes).
#include <registerVectorExtensions.hpp>
#endif

using namespace facebook;
using namespace margelo::nitro;
using namespace margelo::nitro::rnnitrosqlite;

namespace margelo::rnnitrosqlite {

static constexpr double kInt64MinAsDouble = static_cast<double>(std::numeric_limits<int64_t>::min());
static constexpr double kInt64UpperBoundAsDouble = -kInt64MinAsDouble;

std::map<std::string, sqlite3*> dbMap = std::map<std::string, sqlite3*>();

void sqliteOpenDb(const std::string& dbName, const std::string& docPath) {
#ifdef NITRO_SQLITE_VEC
  // Register before opening so the connection exposes vec0 + vec_*.
  margelo::rnnitrosqlitevec::registerVectorExtensions();
#endif

  std::string dbPath = get_db_path(dbName, docPath);

  int sqlOpenFlags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX;

  sqlite3* db;
  int exit = 0;
  exit = sqlite3_open_v2(dbPath.c_str(), &db, sqlOpenFlags, nullptr);

  if (exit != SQLITE_OK) {
    throw NitroSQLiteException(NitroSQLiteExceptionType::DatabaseCannotBeOpened, sqlite3_errmsg(db));
  } else {
    dbMap[dbName] = db;
  }
}

void sqliteCloseDb(const std::string& dbName) {

  if (dbMap.count(dbName) == 0) {
    throw NitroSQLiteException::DatabaseNotOpen(dbName);
  }

  sqlite3* db = dbMap[dbName];

  sqlite3_close_v2(db);

  dbMap.erase(dbName);
}

void sqliteCloseAll() {
  for (auto const& x : dbMap) {
    // In certain cases, this will return SQLITE_OK, mark the database connection as an unusable "zombie",
    // and deallocate the connection later.
    sqlite3_close_v2(x.second);
  }
  dbMap.clear();
}

void sqliteAttachDb(const std::string& mainDBName, const std::string& docPath, const std::string& databaseToAttach,
                    const std::string& alias) {
  /**
   * There is no need to check if mainDBName is opened because sqliteExecuteCommand will do that.
   * */
  std::string dbPath = get_db_path(databaseToAttach, docPath);
  std::string statement = "ATTACH DATABASE '" + dbPath + "' AS " + alias;

  try {
    sqliteExecuteCommand(mainDBName, statement);
  } catch (NitroSQLiteException& e) {
    throw NitroSQLiteException(NitroSQLiteExceptionType::UnableToAttachToDatabase,
                               mainDBName + " was unable to attach another database: " + std::string(e.what()));
  }
}

void sqliteDetachDb(const std::string& mainDBName, const std::string& alias) {
  /**
   * There is no need to check if mainDBName is opened because sqliteExecuteCommand will do that.
   * */
  std::string statement = "DETACH DATABASE " + alias;

  try {
    sqliteExecuteCommand(mainDBName, statement);
  } catch (NitroSQLiteException& e) {
    throw NitroSQLiteException(NitroSQLiteExceptionType::UnableToAttachToDatabase,
                               mainDBName + " was unable to detach database: " + std::string(e.what()));
  }
}

void sqliteRemoveDb(const std::string& dbName, const std::string& docPath) {
  if (dbMap.count(dbName) == 1) {
    sqliteCloseDb(dbName);
  }

  std::string dbFilePath = get_db_path(dbName, docPath);
  if (!file_exists(dbFilePath)) {
    throw NitroSQLiteException::DatabaseFileNotFound(dbFilePath);
  }

  remove(dbFilePath.c_str());
}

void bindStatement(sqlite3_stmt* statement, const SQLiteQueryParams& values) {
  for (int valueIndex = 0; valueIndex < values.size(); valueIndex++) {
    int sqliteIndex = valueIndex + 1;
    SQLiteValue value = values.at(valueIndex);
    if (std::holds_alternative<NullType>(value)) {
      sqlite3_bind_null(statement, sqliteIndex);
    } else if (std::holds_alternative<bool>(value)) {
      sqlite3_bind_int(statement, sqliteIndex, std::get<bool>(value));
    } else if (std::holds_alternative<double>(value)) {
      // Bind whole numbers as INTEGER so vec0 rowid/pk/partition (which reject REAL) work; SQLite still coerces to REAL for REAL columns.
      double doubleValue = std::get<double>(value);
      if (std::trunc(doubleValue) == doubleValue && doubleValue >= kInt64MinAsDouble && doubleValue < kInt64UpperBoundAsDouble) {
        sqlite3_bind_int64(statement, sqliteIndex, static_cast<sqlite3_int64>(doubleValue));
      } else {
        sqlite3_bind_double(statement, sqliteIndex, doubleValue);
      }
    } else if (std::holds_alternative<std::string>(value)) {
      const auto stringValue = std::get<std::string>(value);
      sqlite3_bind_text(statement, sqliteIndex, stringValue.c_str(), stringValue.length(), SQLITE_TRANSIENT);
    } else if (std::holds_alternative<std::shared_ptr<ArrayBuffer>>(value)) {
      const auto arrayBufferValue = std::get<std::shared_ptr<ArrayBuffer>>(value);
      sqlite3_bind_blob(statement, sqliteIndex, arrayBufferValue->data(), arrayBufferValue->size(), SQLITE_STATIC);
    }
  }
}

namespace {

  struct SQLiteStatementFinalizer {
    void operator()(sqlite3_stmt* statement) const noexcept {
      if (statement != nullptr) {
        sqlite3_finalize(statement);
      }
    }
  };

  using SQLiteStatement = std::unique_ptr<sqlite3_stmt, SQLiteStatementFinalizer>;

  sqlite3* getOpenDatabase(const std::string& dbName) {
    if (dbMap.count(dbName) == 0) {
      throw NitroSQLiteException::DatabaseNotOpen(dbName);
    }

    return dbMap[dbName];
  }

  SQLiteStatement prepareStatement(sqlite3* db, const std::string& query, const std::optional<SQLiteQueryParams>& params) {
    sqlite3_stmt* rawStatement = nullptr;
    int statementStatus = sqlite3_prepare_v2(db, query.c_str(), -1, &rawStatement, nullptr);
    SQLiteStatement statement(rawStatement);

    if (statementStatus != SQLITE_OK) {
      throw NitroSQLiteException::SqlExecution(sqlite3_errmsg(db));
    }

    if (params) {
      bindStatement(statement.get(), *params);
    }

    return statement;
  }

  SQLiteValue getColumnValue(sqlite3_stmt* statement, int columnIndex) {
    switch (sqlite3_column_type(statement, columnIndex)) {
      case SQLITE_INTEGER:
      case SQLITE_FLOAT:
        return sqlite3_column_double(statement, columnIndex);
      case SQLITE_TEXT: {
        auto columnValue = reinterpret_cast<const char*>(sqlite3_column_text(statement, columnIndex));
        return std::string(columnValue);
      }
      case SQLITE_BLOB: {
        int blobSize = sqlite3_column_bytes(statement, columnIndex);
        const void* blob = sqlite3_column_blob(statement, columnIndex);
        if (blobSize > 0) {
          const auto* blobData = reinterpret_cast<const uint8_t*>(blob);
          return ArrayBuffer::copy(blobData, static_cast<size_t>(blobSize));
        }
        return ArrayBuffer::allocate(0);
      }
      case SQLITE_NULL:
      default:
        return NullType::null;
    }
  }

  template <typename OnRow>
  void consumeStatement(sqlite3* db, sqlite3_stmt* statement, OnRow&& onRow) {
    while (true) {
      int result = sqlite3_step(statement);

      if (result == SQLITE_ROW) {
        onRow(statement);
        continue;
      }

      if (result == SQLITE_DONE) {
        return;
      }

      throw NitroSQLiteException::SqlExecution(sqlite3_errmsg(db));
    }
  }

} // namespace

std::shared_ptr<HybridNitroSQLiteQueryResult> sqliteExecute(const std::string& dbName, const std::string& query,
                                                            const std::optional<SQLiteQueryParams>& params) {
  auto db = getOpenDatabase(dbName);
  auto statement = prepareStatement(db, query, params);
  SQLiteQueryResults results;

  consumeStatement(db, statement.get(), [&](sqlite3_stmt* currentStatement) {
    SQLiteQueryResultRow row;
    int count = sqlite3_column_count(currentStatement);

    for (int i = 0; i < count; i++) {
      std::string columnName = sqlite3_column_name(currentStatement, i);
      row[columnName] = getColumnValue(currentStatement, i);
    }

    results.push_back(std::move(row));
  });

  std::optional<SQLiteQueryTableMetadata> metadata = std::nullopt;
  int count = sqlite3_column_count(statement.get());
  for (int i = 0; i < count; i++) {
    std::string columnName = sqlite3_column_name(statement.get(), i);
    ColumnType columnDeclaredType = mapSQLiteTypeToColumnType(sqlite3_column_decltype(statement.get(), i));
    auto columnMeta = NitroSQLiteQueryColumnMetadata(columnName, std::move(columnDeclaredType), i);

    if (!metadata) {
      metadata = std::make_optional<SQLiteQueryTableMetadata>();
    }
    metadata->insert({columnName, std::move(columnMeta)});
  }

  int rowsAffected = sqlite3_changes(db);
  long long latestInsertRowId = sqlite3_last_insert_rowid(db);
  return std::make_shared<HybridNitroSQLiteQueryResult>(std::move(results), static_cast<double>(latestInsertRowId), rowsAffected,
                                                        std::move(metadata));
}

SQLiteRawQueryResults sqliteExecuteRaw(const std::string& dbName, const std::string& query,
                                       const std::optional<SQLiteQueryParams>& params) {
  auto db = getOpenDatabase(dbName);
  auto statement = prepareStatement(db, query, params);
  SQLiteRawQueryResults results;

  consumeStatement(db, statement.get(), [&](sqlite3_stmt* currentStatement) {
    const int count = sqlite3_column_count(currentStatement);
    SQLiteRawQueryResultRow row;
    row.reserve(static_cast<size_t>(count));

    for (int i = 0; i < count; i++) {
      row.push_back(getColumnValue(currentStatement, i));
    }

    results.push_back(std::move(row));
  });

  return results;
}

SQLiteOperationResult sqliteExecuteCommand(const std::string& dbName, const std::string& query,
                                           const std::optional<SQLiteQueryParams>& params) {
  auto db = getOpenDatabase(dbName);
  auto statement = prepareStatement(db, query, params);
  bool isReadOnly = sqlite3_stmt_readonly(statement.get()) != 0;

  consumeStatement(db, statement.get(), [](sqlite3_stmt*) {});

  return {.rowsAffected = isReadOnly ? 0 : sqlite3_changes(db)};
}

} // namespace margelo::rnnitrosqlite
