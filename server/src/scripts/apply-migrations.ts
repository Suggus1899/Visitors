/**
 * Apply SQL migrations to the database
 * This script applies the security-related migrations
 */

import sequelize from '../database';
import fs from 'fs';
import path from 'path';

async function applyMigrations() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('✓ Database connection established');

        const migrationsDir = path.join(__dirname, '../migrations');
        const migrationFiles = [
            '001-add-password-policy-fields.sql',
            '002-add-account-lockout-fields.sql',
            '003-extend-audit-log-fields.sql'
        ];

        for (const file of migrationFiles) {
            const filePath = path.join(migrationsDir, file);

            if (!fs.existsSync(filePath)) {
                console.log(`⚠ Migration file not found: ${file}`);
                continue;
            }

            console.log(`\nApplying migration: ${file}`);
            const sql = fs.readFileSync(filePath, 'utf-8');

            // Split by semicolon and execute each statement
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));

            for (const statement of statements) {
                try {
                    await sequelize.query(statement);
                    console.log(`  ✓ Executed: ${statement.substring(0, 50)}...`);
                } catch (error: any) {
                    // Ignore "duplicate column" errors (migration already applied)
                    if (error.message && error.message.includes('duplicate column')) {
                        console.log(`  ⚠ Column already exists, skipping...`);
                    } else {
                        console.error(`  ✗ Error: ${error.message}`);
                        throw error;
                    }
                }
            }

            console.log(`✓ Migration ${file} completed`);
        }

        console.log('\n✓ All migrations applied successfully');
        process.exit(0);
    } catch (error) {
        console.error('✗ Migration failed:', error);
        process.exit(1);
    }
}

applyMigrations();
