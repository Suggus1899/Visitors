import crypto from 'crypto';
import config from '../config/AppConfig';
import logger from '../config/logger';

/**
 * Encryption utility for protecting sensitive data fields
 * Uses AES-256-GCM for authenticated encryption
 */
export class Encryption {
  private static algorithm = 'aes-256-gcm';
  static readonly ENCRYPTED_PREFIX = 'ENC:';

  /**
   * Encrypts plaintext data
   * @param text - Plain text to encrypt
   * @returns Encrypted string in format: encrypted:iv:authTag
   */
  static encrypt(text: string): string {
    if (!text) return '';
    if (!config.encryptionKey) {
      logger.warn('ENCRYPTION_KEY not set, data will not be encrypted');
      return text;
    }

    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(config.encryptionKey, 'hex');

      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = (cipher as any).getAuthTag();

      // Return format: ENC:encrypted:iv:authTag
      return `${this.ENCRYPTED_PREFIX}${encrypted}:${iv.toString('hex')}:${authTag.toString('hex')}`;
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts encrypted data
   * @param encryptedData - Encrypted string in format: encrypted:iv:authTag
   * @returns Decrypted plaintext
   */
  static decrypt(encryptedData: string): string {
    if (!encryptedData) return '';
    if (!config.encryptionKey) {
      logger.warn('ENCRYPTION_KEY not set, returning data as-is');
      return encryptedData;
    }

    if (!this.isEncrypted(encryptedData)) {
      // Not encrypted (plaintext legacy data)
      return encryptedData;
    }

    let dataToParse = encryptedData;
    if (encryptedData.startsWith(this.ENCRYPTED_PREFIX)) {
      dataToParse = encryptedData.slice(this.ENCRYPTED_PREFIX.length);
    }

    try {
      const parts = dataToParse.split(':');
      if (parts.length !== 3) {
        logger.error('Invalid encrypted data format');
        return encryptedData;
      }

      const [encrypted, ivHex, authTagHex] = parts;
      const key = Buffer.from(config.encryptionKey, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      (decipher as any).setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash data using SHA-256 (one-way, for searching)
   * @param text - Text to hash
   * @returns SHA-256 hash
   */
  static hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate cryptographically secure random token
   * @param length - Number of random bytes (default: 32)
   * @returns Hex string token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  static isEncrypted(data: string): boolean {
    if (!data) return false;
    if (data.startsWith(this.ENCRYPTED_PREFIX)) return true;
    
    const parts = data.split(':');
    if (parts.length === 3) {
      // Validate legacy format: iv (32 chars hex) and authTag (32 chars hex)
      const isHex = (str: string) => /^[0-9a-fA-F]+$/.test(str);
      if (parts[1].length === 32 && isHex(parts[1]) && parts[2].length === 32 && isHex(parts[2])) {
        return true;
      }
    }
    return false;
  }
}

export default Encryption;
