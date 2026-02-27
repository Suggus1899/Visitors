import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import config from '../../config/AppConfig';
import { IBackupService, BackupFile } from '../../domain/services/IBackupService';

export class SqliteBackupService implements IBackupService {
  private dbPath: string;
  private backupPath: string;
  private algorithm = 'aes-256-gcm';

  constructor() {
    this.dbPath = path.join(config.dbPath, 'visits.sqlite');
    this.backupPath = config.backupPath;

    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  private getKey(): Buffer {
    const password = config.backupPassword || config.dbEncryptionKey || config.encryptionKey;
    if (!password) {
      throw new Error('BACKUP_PASSWORD (or DB_ENCRYPTION_KEY) is required for encrypted backups');
    }

    // Deterministic key derivation
    return crypto.scryptSync(password, 'backup-salt', 32);
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.sqlite.enc`;
    const targetPath = path.join(this.backupPath, backupName);

    const key = this.getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const input = fs.createReadStream(this.dbPath);
    const output = fs.createWriteStream(targetPath);
    const gzip = zlib.createGzip();

    // Write IV first
    output.write(iv);

    return new Promise((resolve, reject) => {
      // Stream: DB -> Gzip -> Encrypt -> File
      // Note: GCM auth tag handling in streams is tricky. 
      // Cipher.getAuthTag() is only available after final().
      // Can we append AuthTag at the end?
      // Yes.
      
      const pipe = input.pipe(gzip).pipe(cipher);
      
      pipe.pipe(output, { end: false });

      pipe.on('end', () => {
        const authTag = (cipher as any).getAuthTag();
        output.write(authTag);
        output.end();
        resolve(targetPath);
      });

      pipe.on('error', (err) => reject(err));
      input.on('error', (err) => reject(err));
      gzip.on('error', (err) => reject(err));
      output.on('error', (err) => reject(err));
    });
  }

  async listBackups(): Promise<BackupFile[]> {
    if (!fs.existsSync(this.backupPath)) {
        return [];
    }
    
    const files = await fs.promises.readdir(this.backupPath);
    const backupFiles: BackupFile[] = [];

    for (const file of files) {
      // Support old .sqlite and new .enc
      if (file.endsWith('.sqlite') || file.endsWith('.sqlite.enc')) {
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

    // Sort by date desc
    return backupFiles.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async restoreBackup(filename: string): Promise<void> {
    const sourcePath = path.join(this.backupPath, filename);
    if (!fs.existsSync(sourcePath)) {
        throw new Error('Backup file not found');
    }

    if (filename.endsWith('.enc')) {
        await this.restoreEncrypted(sourcePath);
    } else {
        // Legacy plain copy
        await fs.promises.copyFile(sourcePath, this.dbPath);
    }
  }

  private async restoreEncrypted(sourcePath: string): Promise<void> {
    // Read file, extract IV (16 bytes), AuthTag (16 bytes at end? No, stream order matters)
    // We wrote: IV + EncryptedContent + AuthTag
    
    // We need to read IV first.
    const fileBuffer = await fs.promises.readFile(sourcePath);
    
    const iv = fileBuffer.subarray(0, 16);
    const authTag = fileBuffer.subarray(fileBuffer.length - 16);
    const encryptedContent = fileBuffer.subarray(16, fileBuffer.length - 16);

    const key = this.getKey();
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    (decipher as any).setAuthTag(authTag);

    const output = fs.createWriteStream(this.dbPath);
    
    // Using simple buffer decryption logic instead of streams for restore to simplify AuthTag handling
    // For very large DBs, streams are better, but node buffers handle ~2GB.
    
    const decrypted = Buffer.concat([
        decipher.update(encryptedContent),
        decipher.final()
    ]);

    // Decompress
    const decompressed = zlib.gunzipSync(decrypted);
    
    await fs.promises.writeFile(this.dbPath, decompressed);
  }

  async deleteBackup(filename: string): Promise<void> {
      const targetPath = path.join(this.backupPath, filename);
      if (fs.existsSync(targetPath)) {
          await fs.promises.unlink(targetPath);
      }
  }
}
