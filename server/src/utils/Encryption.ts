import crypto from 'crypto';
import config from '../config/AppConfig';

/**
 * Encryption utility for protecting sensitive data fields
 * Uses AES-256-GCM for authenticated encryption
 */
export class Encryption {
  private static algorithm = 'aes-256-gcm';

  /**
   * Encrypts plaintext data
   * @param text - Plain text to encrypt
   * @returns Encrypted string in format: encrypted:iv:authTag
   */
  static encrypt(text: string): string {
    if (!text) return '';
    if (!config.encryptionKey) {
      console.warn('ENCRYPTION_KEY not set, data will not be encrypted');
      return text;
    }

    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(config.encryptionKey, 'hex');
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = (cipher as any).getAuthTag();

      // Return format: encrypted:iv:authTag
      return `${encrypted}:${iv.toString('hex')}:${authTag.toString('hex')}`;
    } catch (error) {
      console.error('Encryption error:', error);
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
      console.warn('ENCRYPTION_KEY not set, returning data as-is');
      return encryptedData;
    }

    // If data doesn't contain colons, it's not encrypted (legacy data)
    if (!encryptedData.includes(':')) {
      return encryptedData;
    }

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        console.error('Invalid encrypted data format');
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
      console.error('Decryption error:', error);
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
}

export default Encryption;
