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

/**
 * Sanitizes HTML by allowing only safe tags (b, i, em, strong, p, br).
 * Use this for fields that may contain basic formatting (notes, descriptions).
 * No attributes are allowed on any tags.
 * 
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML with only safe tags
 * 
 * @example
 * sanitizeHTML('<p>Hello <b>World</b></p>') // Returns: '<p>Hello <b>World</b></p>'
 * sanitizeHTML('<script>alert("xss")</script><p>Safe</p>') // Returns: '<p>Safe</p>'
 * sanitizeHTML('<a href="evil.com">Click</a>') // Returns: 'Click'
 */
export function sanitizeHTML(html: string): string {
    if (!html) return '';

    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
        ALLOWED_ATTR: []
    });
}
