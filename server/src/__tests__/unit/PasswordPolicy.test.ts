/**
 * Unit Tests for PasswordPolicy
 * Tests password validation against security requirements
 */

import { describe, it, expect } from 'vitest';
import { PasswordPolicy } from '../../domain/services/PasswordPolicy';

describe('PasswordPolicy', () => {
    const policy = new PasswordPolicy();

    describe('Valid Passwords', () => {
        it('should accept a valid password with all requirements', () => {
            const result = policy.validate('MyP@ssw0rd123');
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should accept a password with exactly 12 characters', () => {
            const result = policy.validate('MyP@ssw0rd12');
            expect(result.isValid).toBe(true);
        });

        it('should accept a password with 128 characters', () => {
            const longPassword = 'A1b@' + 'x'.repeat(124);
            const result = policy.validate(longPassword);
            expect(result.isValid).toBe(true);
        });

        it('should accept password with multiple special characters', () => {
            const result = policy.validate('MyP@ssw0rd!#$%');
            expect(result.isValid).toBe(true);
        });
    });

    describe('Length Requirements', () => {
        it('should reject password shorter than 12 characters', () => {
            const result = policy.validate('Short1@');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must be at least 12 characters');
        });

        it('should reject password longer than 128 characters', () => {
            const longPassword = 'A1b@' + 'x'.repeat(125);
            const result = policy.validate(longPassword);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must not exceed 128 characters');
        });
    });

    describe('Complexity Requirements', () => {
        it('should reject password without lowercase letter', () => {
            const result = policy.validate('MYP@SSW0RD123');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one lowercase letter');
        });

        it('should reject password without uppercase letter', () => {
            const result = policy.validate('myp@ssw0rd123');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one uppercase letter');
        });

        it('should reject password without number', () => {
            const result = policy.validate('MyP@ssword!!!');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one number');
        });

        it('should reject password without special character', () => {
            const result = policy.validate('MyPassword123');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one special character');
        });
    });

    describe('Common Passwords', () => {
        it('should reject common password "password"', () => {
            const result = policy.validate('password');
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('too common'))).toBe(true);
        });

        it('should reject common password "123456"', () => {
            const result = policy.validate('123456');
            expect(result.isValid).toBe(false);
        });

        it('should reject common password "qwerty"', () => {
            const result = policy.validate('qwerty');
            expect(result.isValid).toBe(false);
        });

        it('should check common passwords case-insensitively', () => {
            const result = policy.validate('PASSWORD');
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('too common'))).toBe(true);
        });
    });

    describe('Multiple Validation Errors', () => {
        it('should return all validation errors for invalid password', () => {
            const result = policy.validate('short');
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });

        it('should return specific errors for password missing multiple requirements', () => {
            const result = policy.validate('alllowercase');
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one uppercase letter');
            expect(result.errors).toContain('Password must contain at least one number');
            expect(result.errors).toContain('Password must contain at least one special character');
        });
    });

    describe('isCommonPassword', () => {
        it('should return true for common passwords', () => {
            expect(policy.isCommonPassword('password')).toBe(true);
            expect(policy.isCommonPassword('123456')).toBe(true);
            expect(policy.isCommonPassword('qwerty')).toBe(true);
        });

        it('should return false for non-common passwords', () => {
            expect(policy.isCommonPassword('MySecureP@ssw0rd123')).toBe(false);
            expect(policy.isCommonPassword('UncommonPassword!23')).toBe(false);
        });

        it('should be case-insensitive', () => {
            expect(policy.isCommonPassword('PASSWORD')).toBe(true);
            expect(policy.isCommonPassword('PaSsWoRd')).toBe(true);
        });
    });
});
