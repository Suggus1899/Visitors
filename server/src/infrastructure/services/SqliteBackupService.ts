import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import config from '../../config/AppConfig';
import { IBackupService, BackupFile, BackupResult } from '../../domain/services/IBackupService';

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

  /**
   * Genera contraseña única en formato: trebol-[8 aleatorios]-[PIN 4 dígitos]
   * Ejemplo: trebol-X7kM9pQ2-4829
   */
  private generateRestorePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 1000-9999
    return `trebol-${randomPart}-${pin}`;
  }

  /**
   * Genera hash SHA-256 de la contraseña para almacenamiento seguro
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Obtiene la ruta del archivo .meta asociado a un backup
   */
  private getMetaPath(backupName: string): string {
    const baseName = backupName.replace('.sqlite.enc', '').replace('.sqlite', '');
    return path.join(this.backupPath, `${baseName}.meta`);
  }

  private getKey(salt: Buffer): Buffer {
    const password = config.backupPassword || config.dbEncryptionKey || config.encryptionKey;
    if (!password) {
      throw new Error('BACKUP_PASSWORD (or DB_ENCRYPTION_KEY) is required for encrypted backups');
    }

    // T-12: Use unique random salt per backup for key derivation
    return crypto.scryptSync(password, salt, 32);
  }

  async createBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.sqlite.enc`;
    const targetPath = path.join(this.backupPath, backupName);

    // Generar contraseña única de restauración
    const restorePassword = this.generateRestorePassword();
    const passwordHash = this.hashPassword(restorePassword);

    const salt = crypto.randomBytes(16);
    const key = this.getKey(salt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const input = fs.createReadStream(this.dbPath);
    const output = fs.createWriteStream(targetPath);
    const gzip = zlib.createGzip();

    // Write salt + IV first (16 bytes salt + 16 bytes IV)
    output.write(salt);
    output.write(iv);

    return new Promise((resolve, reject) => {
      const pipe = input.pipe(gzip).pipe(cipher);
      
      pipe.pipe(output, { end: false });

      pipe.on('end', () => {
        const authTag = (cipher as any).getAuthTag();
        output.write(authTag);
        output.end();
        
        // Guardar metadata con hash de contraseña
        const metaPath = this.getMetaPath(backupName);
        const metaData = {
          createdAt: new Date().toISOString(),
          passwordHash: passwordHash,
          originalName: backupName,
          salt: salt.toString('hex')
        };
        fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
        
        resolve({
          filePath: targetPath,
          restorePassword: restorePassword
        });
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

  /**
   * Verifica si la contraseña de restauración es válida para un backup
   */
  async verifyRestorePassword(filename: string, password: string): Promise<boolean> {
    const metaPath = this.getMetaPath(filename);
    
    if (!fs.existsSync(metaPath)) {
      // Si no hay archivo .meta, es un backup antiguo - no requiere contraseña adicional
      return true;
    }

    const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
    const metaData = JSON.parse(metaContent);
    
    const providedHash = this.hashPassword(password);
    return providedHash === metaData.passwordHash;
  }

  async restoreBackup(filename: string, restorePassword: string): Promise<void> {
    const sourcePath = path.join(this.backupPath, filename);
    if (!fs.existsSync(sourcePath)) {
        throw new Error('Backup file not found');
    }

    // Verificar contraseña de restauración
    const isValid = await this.verifyRestorePassword(filename, restorePassword);
    if (!isValid) {
      throw new Error('Invalid restore password');
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
    
    // T-12: Read salt (16 bytes) + IV (16 bytes) from header
    const salt = fileBuffer.subarray(0, 16);
    const iv = fileBuffer.subarray(16, 32);
    const authTag = fileBuffer.subarray(fileBuffer.length - 16);
    const encryptedContent = fileBuffer.subarray(32, fileBuffer.length - 16);

    const key = this.getKey(salt);
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
      
      // También eliminar el archivo .meta asociado
      const metaPath = this.getMetaPath(filename);
      if (fs.existsSync(metaPath)) {
          await fs.promises.unlink(metaPath);
      }
  }
}
