/**
 * Unit Tests for Encryption utility
 * Tests AES-256-GCM encryption/decryption and SHA-256 hashing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AppConfig so we can control encryptionKey without relying on env.
// vi.hoisted ensures the object exists before the hoisted vi.mock factory runs.
const { mockConfig } = vi.hoisted(() => ({ mockConfig: { encryptionKey: '' } }));
vi.mock('../config/AppConfig', () => ({ default: mockConfig }));

// Mock logger to avoid console noise during tests
vi.mock('../config/logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Encryption } from '../utils/Encryption';

// Valid 32-byte (64 hex char) key for AES-256
const VALID_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Encryption', () => {
  beforeEach(() => {
    mockConfig.encryptionKey = VALID_KEY;
  });

  describe('encrypt() / decrypt() roundtrip', () => {
    it('should return the original plaintext after encrypt then decrypt', () => {
      const plaintext = 'sensitive-data-123';
      const encrypted = Encryption.encrypt(plaintext);
      const decrypted = Encryption.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt the result of encrypt() (explicit roundtrip)', () => {
      const plaintext = 'user@example.com';
      const encrypted = Encryption.encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(Encryption.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle empty string input', () => {
      expect(Encryption.encrypt('')).toBe('');
      expect(Encryption.decrypt('')).toBe('');
    });

    it('should handle long text', () => {
      const plaintext = 'x'.repeat(1000);
      const encrypted = Encryption.encrypt(plaintext);
      expect(Encryption.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle unicode text', () => {
      const plaintext = 'café — naïve — 日本語 — 🎉';
      const encrypted = Encryption.encrypt(plaintext);
      expect(Encryption.decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('encrypt() IV uniqueness', () => {
    it('should return different ciphertext for the same plaintext (unique IV)', () => {
      const plaintext = 'same-secret';
      const a = Encryption.encrypt(plaintext);
      const b = Encryption.encrypt(plaintext);
      expect(a).not.toBe(b);
    });

    it('should produce different ciphertexts across multiple calls', () => {
      const plaintext = 'repeatable-secret';
      const results = new Set(
        Array.from({ length: 10 }, () => Encryption.encrypt(plaintext))
      );
      expect(results.size).toBe(10);
    });
  });

  describe('encrypt() output format', () => {
    it('should include the ENC: prefix', () => {
      const encrypted = Encryption.encrypt('data');
      expect(encrypted.startsWith(Encryption.ENCRYPTED_PREFIX)).toBe(true);
    });

    it('should include IV and authTag in the format ENC:encrypted:iv:authTag', () => {
      const encrypted = Encryption.encrypt('data');
      const body = encrypted.slice(Encryption.ENCRYPTED_PREFIX.length);
      const parts = body.split(':');
      expect(parts).toHaveLength(3);

      const [encryptedHex, ivHex, authTagHex] = parts;
      // IV is 16 bytes -> 32 hex chars
      expect(ivHex).toHaveLength(32);
      expect(/^[0-9a-fA-F]+$/.test(ivHex)).toBe(true);
      // authTag is 16 bytes -> 32 hex chars
      expect(authTagHex).toHaveLength(32);
      expect(/^[0-9a-fA-F]+$/.test(authTagHex)).toBe(true);
      // encrypted body is non-empty hex
      expect(encryptedHex.length).toBeGreaterThan(0);
      expect(/^[0-9a-fA-F]+$/.test(encryptedHex)).toBe(true);
    });
  });

  describe('decrypt() error handling', () => {
    it('should throw when decrypting invalid encrypted data (bad content)', () => {
      // Well-formed structure but invalid ciphertext -> decipher.final throws
      const invalid = `${Encryption.ENCRYPTED_PREFIX}deadbeef:${'00'.repeat(16)}:${'00'.repeat(16)}`;
      expect(() => Encryption.decrypt(invalid)).toThrow('Failed to decrypt data');
    });

    it('should return data as-is when it is not encrypted (legacy plaintext)', () => {
      const plaintext = 'plain-legacy-data';
      expect(Encryption.decrypt(plaintext)).toBe(plaintext);
    });

    it('should return the original string when format has wrong number of parts', () => {
      const bad = `${Encryption.ENCRYPTED_PREFIX}onlyonepart`;
      expect(Encryption.decrypt(bad)).toBe(bad);
    });
  });

  describe('hash()', () => {
    it('should return a 64-character hex string (SHA-256)', () => {
      const hash = Encryption.hash('some-input');
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-fA-F]+$/.test(hash)).toBe(true);
    });

    it('should be deterministic (same input -> same hash)', () => {
      const input = 'deterministic-input';
      expect(Encryption.hash(input)).toBe(Encryption.hash(input));
    });

    it('should produce different hashes for different inputs', () => {
      const a = Encryption.hash('input-a');
      const b = Encryption.hash('input-b');
      expect(a).not.toBe(b);
    });

    it('should match known SHA-256 vector', () => {
      // SHA-256("abc") known value
      expect(Encryption.hash('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
    });
  });

  describe('encrypt() without ENCRYPTION_KEY', () => {
    it('should return plaintext unchanged when key is not configured', () => {
      mockConfig.encryptionKey = '';
      const plaintext = 'unprotected-data';
      expect(Encryption.encrypt(plaintext)).toBe(plaintext);
    });

    it('should return data as-is when decrypting without key configured', () => {
      mockConfig.encryptionKey = '';
      const data = 'some-data';
      expect(Encryption.decrypt(data)).toBe(data);
    });
  });

  describe('isEncrypted()', () => {
    it('should detect ENC: prefixed strings as encrypted', () => {
      const encrypted = Encryption.encrypt('data');
      expect(Encryption.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(Encryption.isEncrypted('plain-text')).toBe(false);
    });

    it('should return false for empty/null input', () => {
      expect(Encryption.isEncrypted('')).toBe(false);
      expect(Encryption.isEncrypted(null as unknown as string)).toBe(false);
    });
  });
});
