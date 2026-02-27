import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import config from './config/AppConfig';

// SQLCipher driver (drop-in replacement for sqlite3)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlcipher = require('@journeyapps/sqlcipher');

// Database folder from config
const dataFolder = config.dbPath;

// Create data folder if it doesn't exist
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dataFolder, 'visits.sqlite'),
    dialectModule: sqlcipher,
    logging: false // Disable logging for cleaner output
});

export const initializeDatabaseEncryption = async () => {
    if (!config.dbEncryptionKey) {
        throw new Error('DB_ENCRYPTION_KEY is required to use SQLCipher');
    }

    // Apply SQLCipher key before any other operations
    await sequelize.query(`PRAGMA key = '${config.dbEncryptionKey}';`);
    await sequelize.query('PRAGMA cipher_compatibility = 4;');
    await sequelize.query('PRAGMA cipher_migrate;');

    try {
        await sequelize.query('SELECT count(*) FROM sqlite_master');
    } catch (error) {
        throw new Error('Failed to open encrypted database. Verify DB_ENCRYPTION_KEY or migrate a plaintext database before startup.');
    }
};

export default sequelize;
