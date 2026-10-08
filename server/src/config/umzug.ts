import { Umzug, SequelizeStorage } from 'umzug';
import sequelize from '../database';
import path from 'path';
import fs from 'fs';
import logger from './logger';

export const migrator = new Umzug({
  migrations: async context => {
    const directory = path.join(__dirname, '../migrations');
    return fs.readdirSync(directory).filter(name => /\.(ts|sql)$/.test(name) && !name.endsWith('.down.sql')).sort().map(name => {
      const filePath = path.join(directory, name);
      if (path.extname(filePath) === '.sql') {
        const execute = async (file: string) => {
          const sql = fs.readFileSync(file, 'utf8');
          await context.transaction(async transaction => { await context.query(sql, { transaction }); });
        };
        return { name, path: filePath, up: () => execute(filePath), down: () => execute(filePath.replace(/\.sql$/, '.down.sql')) };
      }
      return { name, path: filePath, up: async () => require(filePath).up({ context }), down: async () => require(filePath).down?.({ context }) };
    });
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize }),
  logger,
});

export type Migration = typeof migrator._types.migration;
