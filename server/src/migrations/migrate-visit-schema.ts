import sequelize from '../database';

/**
 * @deprecated SQLite-only legacy migration script. Not used with PostgreSQL.
 * Schema migrations are handled by Sequelize sync + umzug SQL files.
 */
export async function migrateVisitSchema() {
  console.log('Starting Visit table migration...');

  try {
    // Check if columns exist before modifying
    const [columns]: any = await sequelize.query(`
      PRAGMA table_info(Visits);
    `);

    const columnNames = columns.map((col: any) => col.name);

    // SQLite doesn't support RENAME COLUMN directly in older versions
    // We'll use a workaround: create new table, copy data, replace old table
    
    await sequelize.query('BEGIN TRANSACTION;');

    // Step 1: Create new table with correct schema
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS Visits_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_cedula TEXT NOT NULL,
        purpose TEXT NOT NULL,
        person_to_visit TEXT NOT NULL,
        check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        check_out_time DATETIME,
        status TEXT DEFAULT 'active' CHECK(status IN ('waiting', 'active', 'completed')),
        notes TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (visitor_cedula) REFERENCES Visitors(cedula)
      );
    `);

    // Step 2: Copy data from old table (mapping old column names)
    // Use COALESCE to handle missing columns gracefully
    await sequelize.query(`
      INSERT INTO Visits_new (
        id, visitor_cedula, purpose, person_to_visit, 
        check_in_time, check_out_time, status, notes,
        createdAt, updatedAt
      )
      SELECT 
        id,
        visitor_cedula,
        COALESCE(purpose, purpose, 'Visit') as purpose,
        COALESCE(person_to_visit, 'N/A') as person_to_visit,
        COALESCE(check_in_time, check_in_time, CURRENT_TIMESTAMP) as check_in_time,
        COALESCE(check_out_time, check_out_time, NULL) as check_out_time,
        status,
        COALESCE(notes, NULL) as notes,
        COALESCE(createdAt, CURRENT_TIMESTAMP) as createdAt,
        COALESCE(updatedAt, CURRENT_TIMESTAMP) as updatedAt
      FROM Visits;
    `);

    // Step 3: Drop old table
    await sequelize.query('DROP TABLE Visits;');

    // Step 4: Rename new table
    await sequelize.query('ALTER TABLE Visits_new RENAME TO Visits;');

    await sequelize.query('COMMIT;');

    console.log('✅ Visit table migration completed successfully!');
    console.log('   - Renamed: reason → purpose');
    console.log('   - Renamed: check_in → check_in_time');
    console.log('   - Renamed: check_out → check_out_time');
    console.log('   - Added: person_to_visit (default: "N/A")');
    console.log('   - Added: notes');

  } catch (error) {
    await sequelize.query('ROLLBACK;');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateVisitSchema()
    .then(() => {
      console.log('Migration complete. Server can now start.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
