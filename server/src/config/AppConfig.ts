import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from workspace .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface AppConfig {
  // Server
  port: number;
  nodeEnv: string;

  // Database
  dbPath: string;
  dbEncryptionKey: string;

  // JWT
  jwtSecret: string;
  jwtAccessExpiration: string;
  jwtRefreshExpiration: string;

  // Encryption
  encryptionKey: string;

  // Backup
  backupPath: string;
  backupPassword: string;

  // GDPR
  dataRetentionDays: number;

  // Security
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  bcryptRounds: number;
}

class Config implements AppConfig {
  // Server
  port = parseInt(process.env.PORT || '3000', 10);
  nodeEnv = process.env.NODE_ENV || 'development';

  // Database
  dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data');
  dbEncryptionKey = process.env.DB_ENCRYPTION_KEY || '';

  // JWT
  jwtSecret = process.env.JWT_SECRET || 'default_dev_secret_change_me';
  jwtAccessExpiration = process.env.JWT_ACCESS_EXPIRATION || '15m';
  jwtRefreshExpiration = process.env.JWT_REFRESH_EXPIRATION || '7d';

  // Encryption
  encryptionKey = process.env.ENCRYPTION_KEY || '';

  // Backup
  backupPath = process.env.BACKUP_PATH || path.join(__dirname, '../../../Backups');
  backupPassword = process.env.BACKUP_PASSWORD || '';

  // GDPR
  dataRetentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '60', 10);

  // Security
  maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
  lockoutDurationMinutes = parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10);
  rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
  bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

  validate() {
    const errors: string[] = [];

    if (this.nodeEnv === 'production') {
      if (this.jwtSecret === 'default_dev_secret_change_me') {
        errors.push('JWT_SECRET must be set in production');
      }
      if (!this.dbEncryptionKey) {
        errors.push('DB_ENCRYPTION_KEY must be set in production');
      }
      if (!this.encryptionKey) {
        errors.push('ENCRYPTION_KEY must be set in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }
}

const config = new Config();
config.validate();

export default config;
