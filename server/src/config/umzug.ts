import { Umzug, SequelizeStorage } from 'umzug';
import sequelize from '../database';
import path from 'path';
import logger from './logger';

export const migrator = new Umzug({
  migrations: {
    glob: ['../migrations/*.{ts,sql}', { cwd: __dirname }],
    resolve: ({ name, path: filePath, context }) => {
      const ext = path.extname(filePath || '');
      if (ext === '.sql') {
        return {
          name,
          up: async () => {
            if (!filePath) return;
            const fs = require('fs');
            const sql = fs.readFileSync(filePath, 'utf8');
            const statements = sql
              .split(';')
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0 && !s.startsWith('--'));
            
            for (const statement of statements) {
              try {
                await context.query(statement);
              } catch (error: any) {
                if (error.message && error.message.includes('duplicate column')) {
                  logger.warn(`Column already exists, skipping...`);
                } else {
                  throw error;
                }
              }
            }
          },
          down: async () => {
            logger.warn(`Down migration not explicitly supported for SQL file: ${name}`);
          }
        };
      }
      
      const migration = require(filePath as string);
      return {
        name,
        up: async () => migration.up({ context }),
        down: async () => migration.down?.({ context })
      };
    }
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize }),
  logger,
});

export type Migration = typeof migrator._types.migration;
