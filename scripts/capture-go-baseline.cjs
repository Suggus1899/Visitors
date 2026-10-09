// Capture contracts and fictitious compatibility fixtures; never read application records.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'server-go');
fs.mkdirSync(path.join(out, 'contracts'), { recursive: true });
const routes = [];
for (const filename of fs.readdirSync(path.join(root, 'server/src/routes')).sort()) {
  const source = fs.readFileSync(path.join(root, 'server/src/routes', filename), 'utf8');
  for (const match of source.matchAll(/router\.(get|post|patch|put|delete)\('([^']+)',([^\n]+)/g)) {
    routes.push({ method: match[1].toUpperCase(), path: filename === 'health.routes.ts' ? '/api/v1/health' : '/api' + match[2], source: `server/src/routes/${filename}`, protected: /verifyToken|verifySseToken/.test(match[3]), middleware: ['isAdmin','isSuperAdmin','verifyAuditor','denyAuditorOnly','authorizeVisitorEdit'].filter(x => match[3].includes(x)), binary: /\/(photo|id-photo)$/.test(match[2]), stream: filename === 'events.routes.ts' });
  }
}
fs.writeFileSync(path.join(out, 'contracts/routes.json'), JSON.stringify(routes, null, 2) + '\n');
const passwordSource=fs.readFileSync(path.join(root,'server/src/domain/services/common-passwords.ts'),'utf8');
fs.writeFileSync(path.join(out,'contracts/common-passwords.json'),JSON.stringify([...new Set([...passwordSource.matchAll(/'([^']+)'/g)].map(x=>x[1]))],null,2)+'\n');
const key = '19'.repeat(32);
process.env.JWT_SECRET = 'fixture-only-not-a-real-secret-'.repeat(2);
process.env.ENCRYPTION_KEY = key;
process.env.DOTENV_CONFIG_PATH = path.join(out, '.nonexistent-fixture-env');
require(path.join(root, 'server/node_modules/ts-node')).register({ project: path.join(root, 'server/tsconfig.json'), transpileOnly: true });
const Encryption = require(path.join(root, 'server/src/utils/Encryption')).default;
const bcrypt = require(path.join(root, 'server/node_modules/bcryptjs'));
const jwt = require(path.join(root, 'server/node_modules/jsonwebtoken'));
const password = 'Ficticia!12Árbol';
const payload = { id: 123, username: 'fixture', role: 'operador', tokenVersion: 7, iat: 1700000000, exp: 1900000000 };
const salt = Buffer.from('27'.repeat(16), 'hex'), iv = Buffer.from('35'.repeat(16), 'hex');
const backupKey = crypto.scryptSync('fixture-backup-password', salt, 32);
const gzip = require('node:zlib').gzipSync(Buffer.from('fictitious dump bytes'));
const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
const ciphertext = Buffer.concat([cipher.update(gzip), cipher.final()]);
const encrypted = Encryption.encrypt('Visitante ficticio Álvarez 📷');
const fixture = { key, plaintext: 'Visitante ficticio Álvarez 📷', encrypted, legacyEncrypted: encrypted.slice(4), cedula: 'V-12345678', cedulaHash: Encryption.hash('V-12345678'), password, passwordHash: bcrypt.hashSync(password, 4), longPassword: 'á'.repeat(50), longPasswordHash: bcrypt.hashSync('á'.repeat(50), 4), jwtSecret: process.env.JWT_SECRET, jwt: jwt.sign(payload, process.env.JWT_SECRET), payload, backupPassword: 'fixture-backup-password', backup: Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]).toString('base64'), backupPlaintext: 'fictitious dump bytes' };
fs.writeFileSync(path.join(out, 'contracts/crypto-node.json'), JSON.stringify(fixture, null, 2) + '\n');
console.log(`Captured ${routes.length} real routes and fictitious Node compatibility fixtures`);
if (process.argv.includes('--schema')) {
  const config = require(path.join(root, 'server/node_modules/dotenv')).parse(fs.readFileSync(path.join(root, '.env.logmaster-test.local')));
  if (config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '55432' || config.DB_NAME !== 'logmaster_test') throw new Error('Schema capture requires the isolated test database');
  const folder = path.join(out, 'db/migrations');
  fs.mkdirSync(folder, { recursive: true });
  const dumpPath = path.join(out, 'db/schema.sql');
  const binary = path.resolve(root, '../Visitors-local/pgsql/bin/pg_dump.exe');
  execFileSync(binary, ['-h', config.DB_HOST, '-p', config.DB_PORT, '-U', config.DB_USER, '-d', config.DB_NAME, '--schema-only', '--exclude-table=goose_db_version', '--no-owner', '--no-acl', '--file', dumpPath], {env: {...process.env, PGPASSWORD: config.DB_PASSWORD}});
  const sql = fs.readFileSync(dumpPath, 'utf8').replace(/^\\(?:un)?restrict.*$/gm, '').replace(/^(?:SET |SELECT pg_catalog\.set_config).*$/gm, '');
  fs.writeFileSync(dumpPath, sql);
  fs.writeFileSync(path.join(folder, '00001_baseline.sql'), '-- +goose Up\n-- +goose StatementBegin\n' + sql + '\n-- +goose StatementEnd\n\n-- +goose Down\n-- +goose StatementBegin\nDO $$ BEGIN RAISE EXCEPTION \'The initial baseline is irreversible; restore a verified backup instead\'; END $$;\n-- +goose StatementEnd\n');
  const {Client} = require(path.join(root, 'server/node_modules/pg'));
  const db = new Client({host:config.DB_HOST,port:Number(config.DB_PORT),user:config.DB_USER,password:config.DB_PASSWORD,database:config.DB_NAME});
  (async () => {
    try {
      await db.connect();
      const columns = await db.query(`SELECT table_name, column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name<>'goose_db_version' ORDER BY table_name, ordinal_position`);
      const constraints = await db.query(`SELECT c.relname AS table_name, con.conname AS name, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname`);
      fs.writeFileSync(path.join(out,'contracts/schema-node.json'), JSON.stringify({columns:columns.rows,constraints:constraints.rows},null,2)+'\n');
      console.log('Captured test schema, including '+columns.rows.length+' columns; no application data captured');
    } finally {await db.end();}
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
