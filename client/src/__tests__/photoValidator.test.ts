import { describe, it, expect } from 'vitest';
import { validateImage, getImageType, getImageSize } from '../utils/photoValidator';

describe('PhotoValidator', () => {
  describe('getImageType', () => {
    it('should return type for valid JPEG image', () => {
      const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const type = getImageType(base64);
      expect(type).toBe('data:image/jpeg;base64,');
    });

    it('should return null for invalid image type', () => {
      const base64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAP==';
      const type = getImageType(base64);
      expect(type).toBeNull();
    });
  });

  describe('validateImage', () => {
    it('should validate a valid JPEG image', () => {
      const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const result = validateImage(base64);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid image type', () => {
      const base64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAP==';
      const result = validateImage(base64);
      expect(result.isValid).toBe(false);
    });
  });
});