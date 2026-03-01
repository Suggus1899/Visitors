/**
 * Password Policy Service
 * Validates passwords against security requirements
 * Requirements: 4.1-4.9
 */

import { COMMON_PASSWORDS } from './common-passwords';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export class PasswordPolicy {
    private readonly MIN_LENGTH = 12;
    private readonly MAX_LENGTH = 128;

    /**
     * Validate password against all policy requirements
     * Requirements: 4.1-4.8
     */
    validate(password: string): ValidationResult {
        const errors: string[] = [];

        // Check length (Requirements: 4.1, 4.7)
        if (password.length < this.MIN_LENGTH) {
            errors.push(`Password must be at least ${this.MIN_LENGTH} characters`);
        }
        if (password.length > this.MAX_LENGTH) {
            errors.push(`Password must not exceed ${this.MAX_LENGTH} characters`);
        }

        // Check for lowercase letter (Requirement: 4.2)
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        // Check for uppercase letter (Requirement: 4.3)
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        // Check for number (Requirement: 4.4)
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        // Check for special character (Requirement: 4.5)
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        // Check against common passwords (Requirement: 4.6)
        if (this.isCommonPassword(password)) {
            errors.push('Password is too common and easily guessable. Please choose a more unique password');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if password is in the common passwords list
     * Requirement: 4.6
     */
    isCommonPassword(password: string): boolean {
        return COMMON_PASSWORDS.has(password.toLowerCase());
    }
}

// Export singleton instance
export const passwordPolicy = new PasswordPolicy();
