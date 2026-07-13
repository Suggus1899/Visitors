const bcrypt = require('bcryptjs');
const config = require('../server/dist/config/AppConfig').default;
const { Sequelize } = require('sequelize');

async function main() {
  const sequelize = new Sequelize(config.dbName, config.dbUser, config.dbPassword, {
    host: config.dbHost,
    port: config.dbPort,
    dialect: 'postgres',
    logging: false
  });
  await sequelize.authenticate();
  const hash = await bcrypt.hash('admin123', 12);
  await sequelize.query(
    `UPDATE "Users" SET password='${hash}', "loginAttempts"=0, "lockedUntil"=NULL WHERE username='Admin@trebol.com'`
  );
  const [users] = await sequelize.query(
    `SELECT id, username, role FROM "Users" WHERE username='Admin@trebol.com'`
  );
  console.log('Updated user:', JSON.stringify(users, null, 2));
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
