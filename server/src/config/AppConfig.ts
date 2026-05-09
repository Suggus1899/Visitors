import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from workspace .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

interface AppConfig {
  // Server
  port: number;
  nodeEnv: string;

  // Database
  dbPath: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbSsl: boolean;

  // JWT
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiration: string;
  jwtRefreshExpiration: string;

  // Encryption
  encryptionKey: string;

  // Backup
  backupPath: string;
  backupPassword: string;

  // GDPR
  dataRetentionDays: number;
  auditLogRetentionDays: number;

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
  dbHost = process.env.DB_HOST || 'localhost';
  dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  dbName = process.env.DB_NAME || 'visitors';
  dbUser = process.env.DB_USER || 'postgres';
  dbPassword = process.env.DB_PASSWORD || '';
  dbSsl = process.env.DB_SSL === 'true';

  // JWT — no defaults; must be explicitly configured
  jwtSecret = process.env.JWT_SECRET || '';
  jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';
  jwtAccessExpiration = process.env.JWT_ACCESS_EXPIRATION || '15m';
  jwtRefreshExpiration = process.env.JWT_REFRESH_EXPIRATION || '7d';

  // Encryption
  encryptionKey = process.env.ENCRYPTION_KEY || '';

  // Backup
  backupPath = process.env.BACKUP_PATH || path.join(__dirname, '../../../Backups');
  backupPassword = process.env.BACKUP_PASSWORD || '';

  // GDPR
  dataRetentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '60', 10);
  auditLogRetentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10);

  // Security
  maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
  lockoutDurationMinutes = parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10);
  rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
  bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

  validate() {
    const errors: string[] = [];

    // JWT_SECRET is always required (no default fallback)
    if (!this.jwtSecret) {
      errors.push('JWT_SECRET must be set');
    }
    // Auto-derive refresh secret from main secret if not explicitly set
    if (!this.jwtRefreshSecret && this.jwtSecret) {
      const crypto = require('crypto');
      this.jwtRefreshSecret = crypto.createHash('sha256').update(this.jwtSecret + ':refresh').digest('hex');
    }

    if (this.nodeEnv === 'production') {
      if (!this.dbPassword) {
        errors.push('DB_PASSWORD must be set in production');
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
