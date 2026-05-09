import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../../config/AppConfig';
import { IBackupService, BackupFile, BackupResult } from '../../domain/services/IBackupService';

const execFileAsync = promisify(execFile);

export class SqliteBackupService implements IBackupService {
  private backupPath: string;
  private algorithm = 'aes-256-gcm';

  constructor() {
    this.backupPath = config.backupPath;

    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  /**
   * Genera contraseña única en formato: trebol-[8 aleatorios]-[PIN 4 dígitos]
   */
  private generateRestorePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    return `trebol-${randomPart}-${pin}`;
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private getMetaPath(backupName: string): string {
    const baseName = backupName.replace('.dump.enc', '').replace('.dump', '');
    return path.join(this.backupPath, `${baseName}.meta`);
  }

  private getKey(salt: Buffer): Buffer {
    const password = config.backupPassword || config.encryptionKey;
    if (!password) {
      throw new Error('BACKUP_PASSWORD is required for encrypted backups');
    }
    return crypto.scryptSync(password, salt, 32);
  }

  /**
   * Creates an encrypted PostgreSQL dump using pg_dump
   */
  async createBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.dump.enc`;
    const targetPath = path.join(this.backupPath, backupName);

    const restorePassword = this.generateRestorePassword();
    const passwordHash = this.hashPassword(restorePassword);

    // Dump PostgreSQL to a buffer using pg_dump
    const env = {
      ...process.env,
      PGPASSWORD: config.dbPassword
    };

    const { stdout } = await execFileAsync(
      'pg_dump',
      [
        '-h', config.dbHost,
        '-p', String(config.dbPort),
        '-U', config.dbUser,
        '-d', config.dbName,
        '--format=custom',
        '--no-password'
      ],
      { env, encoding: 'buffer', maxBuffer: 500 * 1024 * 1024 }
    );

    const dumpBuffer = stdout as unknown as Buffer;

    // Compress + encrypt
    const compressed = zlib.gzipSync(dumpBuffer);
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = this.getKey(salt);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const authTag = (cipher as any).getAuthTag() as Buffer;

    // Format: salt(16) + iv(16) + authTag(16) + encryptedData
    const output = Buffer.concat([salt, iv, authTag, encrypted]);
    await fs.promises.writeFile(targetPath, output);

    const metaData = {
      createdAt: new Date().toISOString(),
      passwordHash,
      originalName: backupName,
      salt: salt.toString('hex'),
      engine: 'postgresql'
    };
    fs.writeFileSync(this.getMetaPath(backupName), JSON.stringify(metaData, null, 2));

    return { filePath: targetPath, restorePassword };
  }

  async listBackups(): Promise<BackupFile[]> {
    if (!fs.existsSync(this.backupPath)) {
      return [];
    }

    const files = await fs.promises.readdir(this.backupPath);
    const backupFiles: BackupFile[] = [];

    for (const file of files) {
      if (file.endsWith('.dump.enc') || file.endsWith('.dump') || file.endsWith('.sqlite.enc')) {
        const filePath = path.join(this.backupPath, file);
        const stats = await fs.promises.stat(filePath);
        backupFiles.push({
          name: file,
          date: stats.mtime,
          sizeBytes: stats.size,
          path: filePath
        });
      }
    }

    return backupFiles.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async verifyRestorePassword(filename: string, password: string): Promise<boolean> {
    const metaPath = this.getMetaPath(filename);
    if (!fs.existsSync(metaPath)) {
      return true;
    }
    const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
    const metaData = JSON.parse(metaContent);
    return this.hashPassword(password) === metaData.passwordHash;
  }

  async restoreBackup(filename: string, restorePassword: string): Promise<void> {
    const sourcePath = path.join(this.backupPath, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Backup file not found');
    }

    const isValid = await this.verifyRestorePassword(filename, restorePassword);
    if (!isValid) {
      throw new Error('Invalid restore password');
    }

    if (filename.endsWith('.enc')) {
      await this.restoreEncrypted(sourcePath);
    } else {
      await this.restoreDump(sourcePath);
    }
  }

  private async restoreEncrypted(sourcePath: string): Promise<void> {
    const fileBuffer = await fs.promises.readFile(sourcePath);

    const salt = fileBuffer.subarray(0, 16);
    const iv = fileBuffer.subarray(16, 32);
    const authTag = fileBuffer.subarray(32, 48);
    const encryptedContent = fileBuffer.subarray(48);

    const key = this.getKey(salt);
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    (decipher as any).setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
    const decompressed = zlib.gunzipSync(decrypted);

    // Write to temp file, restore via pg_restore
    const tmpPath = path.join(this.backupPath, `_restore_tmp_${Date.now()}.dump`);
    await fs.promises.writeFile(tmpPath, decompressed);

    try {
      await this.restoreDump(tmpPath);
    } finally {
      fs.existsSync(tmpPath) && fs.unlinkSync(tmpPath);
    }
  }

  private async restoreDump(dumpPath: string): Promise<void> {
    const env = { ...process.env, PGPASSWORD: config.dbPassword };
    await execFileAsync(
      'pg_restore',
      [
        '-h', config.dbHost,
        '-p', String(config.dbPort),
        '-U', config.dbUser,
        '-d', config.dbName,
        '--clean',
        '--no-password',
        '--if-exists',
        dumpPath
      ],
      { env }
    );
  }

  async deleteBackup(filename: string): Promise<void> {
    const targetPath = path.join(this.backupPath, filename);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
    const metaPath = this.getMetaPath(filename);
    if (fs.existsSync(metaPath)) {
      await fs.promises.unlink(metaPath);
    }
  }
}
