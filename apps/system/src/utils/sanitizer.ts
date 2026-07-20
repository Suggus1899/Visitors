import DOMPurify from 'dompurify';

/**
 * Sanitizer utility for XSS protection
 * 
 * This module provides functions to sanitize user input before rendering
 * to prevent Cross-Site Scripting (XSS) attacks.
 */

/**
 * Sanitizes input by removing ALL HTML tags while preserving text content.
 * Use this for fields that should never contain HTML (names, companies, etc.)
 * 
 * @param input - The string to sanitize
 * @returns Sanitized string with all HTML tags removed
 * 
 * @example
 * sanitizeInput('<script>alert("xss")</script>Hello') // Returns: 'Hello'
 * sanitizeInput('John <b>Doe</b>') // Returns: 'John Doe'
 */
export function sanitizeInput(input: string): string {
    if (!input) return '';

    return DOMPurify.sanitize(input, {
        ALLOWED_TAGS: [],
        KEEP_CONTENT: true
    });
}
