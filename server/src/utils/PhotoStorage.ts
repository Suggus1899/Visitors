import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import config from '../config/AppConfig';
import logger from '../config/logger';

/**
 * Photo storage utility for saving visitor photos to filesystem
 * instead of storing Base64 in database
 */
export class PhotoStorage {
  private static photosDir = path.join(config.dbPath, 'photos');

  /**
   * Initialize photos directory if it doesn't exist
   */
  static init() {
    if (!fs.existsSync(this.photosDir)) {
      fs.mkdirSync(this.photosDir, { recursive: true });
      logger.info(`Created photos directory: ${this.photosDir}`);
    }
  }

  /**
   * Save photo from Base64 to filesystem
   * @param base64Data - Base64 encoded image data (with or without data:image prefix)
   * @param cedula - Visitor's cedula (used as filename)
   * @returns Relative path to saved photo
   */
  static async savePhoto(base64Data: string, cedula: string): Promise<string> {
    try {
      // Remove data:image/jpeg;base64, prefix if present
      const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');

      // Create buffer from base64
      const imageBuffer = Buffer.from(base64Clean, 'base64');

      // T-16: Use UUID for photo filenames instead of cedula hash to prevent enumeration
      const uuid = crypto.randomUUID();
      const filename = `${uuid}.jpg`;
      const filepath = path.join(this.photosDir, filename);

      // Write file
      fs.writeFileSync(filepath, imageBuffer);

      // Return relative path
      return `/data/photos/${filename}`;
    } catch (error) {
      logger.error('Error saving photo:', error);
      throw new Error('Failed to save photo');
    }
  }

  /**
   * Delete photo from filesystem
   * @param photoPath - Relative path to photo (e.g., /data/photos/12345678_123456.jpg)
   */
  static async deletePhoto(photoPath: string): Promise<void> {
    try {
      if (!photoPath) return;

      const filename = path.basename(photoPath);
      const filepath = path.join(this.photosDir, filename);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        logger.debug(`Deleted photo: ${filename}`);
      }
    } catch (error) {
      logger.error('Error deleting photo:', error);
      // Don't throw - deletion failure shouldn't block operations
    }
  }

  /**
   * Get photo as Buffer
   * @param photoPath - Relative path to photo
   * @returns Photo buffer
   */
  static async getPhoto(photoPath: string): Promise<Buffer> {
    try {
      const filename = path.basename(photoPath);
      const filepath = path.join(this.photosDir, filename);

      if (!fs.existsSync(filepath)) {
        throw new Error('Photo not found');
      }

      return fs.readFileSync(filepath);
    } catch (error) {
      logger.error('Error reading photo:', error);
      throw new Error('Failed to read photo');
    }
  }

  /**
   * Check if photo exists
   * @param photoPath - Relative path to photo
   * @returns true if photo exists
   */
  static photoExists(photoPath: string): boolean {
    try {
      const filename = path.basename(photoPath);
      const filepath = path.join(this.photosDir, filename);
      return fs.existsSync(filepath);
    } catch {
      return false;
    }
  }

  /**
   * Clean up old photos (called by CRON job).
   * Photos whose filename is present in `protectedFilenames` are kept
   * permanently regardless of age (e.g. photos linked to a registered Visitor).
   * @param daysOld - Delete photos older than this many days
   * @param protectedFilenames - Set of filenames (basename only) that must never be deleted
   */
  static async cleanupOldPhotos(
    daysOld: number,
    protectedFilenames: Set<string> = new Set()
  ): Promise<number> {
    try {
      const files = fs.readdirSync(this.photosDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        // Never delete photos that belong to a registered visitor
        if (protectedFilenames.has(file)) {
          continue;
        }

        const filepath = path.join(this.photosDir, file);
        const stats = fs.statSync(filepath);

        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      }

      logger.info(`Cleaned up ${deletedCount} old photos (>${daysOld} days), ${protectedFilenames.size} protected`);
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up photos:', error);
      return 0;
    }
  }
}

// Initialize photos directory on module load
PhotoStorage.init();

export default PhotoStorage;
