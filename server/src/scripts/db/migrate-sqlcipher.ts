import path from 'path';
import dotenv from 'dotenv';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlcipher = require('@journeyapps/sqlcipher');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const sourcePath = process.env.SQLCIPHER_SOURCE || path.join(__dirname, '../../../data/visits.sqlite');
const targetPath = process.env.SQLCIPHER_TARGET || path.join(__dirname, '../../../data/visits.encrypted.sqlite');
const key = process.env.DB_ENCRYPTION_KEY;

if (!key) {
  console.error('DB_ENCRYPTION_KEY is required to migrate to SQLCipher.');
  process.exit(1);
}

const db = new sqlcipher.Database(sourcePath);

db.serialize(() => {
  db.run(`ATTACH DATABASE '${targetPath}' AS encrypted KEY '${key}';`);
  db.run('PRAGMA encrypted.cipher_compatibility = 4;');
  db.run("SELECT sqlcipher_export('encrypted');");
  db.run('DETACH DATABASE encrypted;');
});

db.close((err: Error | null) => {
  if (err) {
    console.error('SQLCipher migration failed:', err.message);
    process.exit(1);
  }

  console.log('SQLCipher migration completed successfully.');
  console.log(`Encrypted DB created at: ${targetPath}`);
});