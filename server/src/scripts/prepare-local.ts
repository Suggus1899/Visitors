import sequelize from '../database';
import config from '../config/AppConfig';
import { migrator } from '../config/umzug';
import { ensureBaseUsers } from '../utils/seeder';
import '../models/ActivityLog';
import '../models/ArcoRequest';
import '../models/IntermittentLog';
import '../models/VisitorEditHistory';
import User from '../models/User';

async function prepare() {
    if (config.dbHost !== '127.0.0.1' || config.dbPort !== 55432 || !['logmaster_dev', 'logmaster_test', 'logmaster_restore_test'].includes(config.dbName)) {
        throw new Error('Local setup is restricted to the isolated LogMaster databases on 127.0.0.1:55432');
    }
    await sequelize.authenticate();
    if (!(await sequelize.getQueryInterface().showAllTables()).length) await sequelize.sync();
    await migrator.up();
    await sequelize.query('DELETE FROM "SequelizeMeta" WHERE name LIKE \'%.down.sql\'');
    await ensureBaseUsers();
    for (const user of await User.findAll()) {
        if (!user.email && user.role !== 'demo') await user.update({ email: user.username.toLowerCase() + '@example.test' });
    }
    console.log('Prepared ' + config.dbName);
}

prepare().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
