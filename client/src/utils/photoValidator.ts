/**
 * Photo Validator Utility
 * 
 * Validates image uploads for type and size constraints.
 * Requirements: 12.1, 12.2, 12.4, 12.5
 */

export interface ValidationResult {
    isValid: boolean;
    error?: string;
    size?: number;
    type?: string;
}

// Allowed image types (JPEG and PNG only)
const ALLOWED_TYPES = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,'
];

// Maximum file size: 5MB
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Extract the MIME type from a base64 string
 * @param base64String - The base64 encoded image string
 * @returns The MIME type prefix or null if invalid
 */
export function getImageType(base64String: string): string | null {
    for (const type of ALLOWED_TYPES) {
        if (base64String.startsWith(type)) {
            return type;
        }
    }
    return null;
}

/**
 * Calculate the file size in bytes from a base64 string
 * Formula: (length * 3/4) - padding
 * @param base64String - The base64 encoded image string
 * @returns The size in bytes
 */
export function getImageSize(base64String: string): number {
    // Remove the data:image/...;base64, prefix
    const base64Data = base64String.split(',')[1] || base64String;

    // Count padding characters (=)
    const padding = (base64Data.match(/=/g) || []).length;

    // Calculate size: (length * 3/4) - padding
    return (base64Data.length * 3 / 4) - padding;
}

/**
 * Validate an image for type and size constraints
 * @param base64String - The base64 encoded image string
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateImage(base64String: string): ValidationResult {
    // Validate type
    const type = getImageType(base64String);
    if (!type) {
        return {
            isValid: false,
            error: 'Tipo de imagen inválido. Solo se permiten JPEG y PNG.'
        };
    }

    // Validate size
    const size = getImageSize(base64String);
    if (size > MAX_SIZE_BYTES) {
        const sizeMB = (size / (1024 * 1024)).toFixed(2);
        return {
            isValid: false,
            error: `El tamaño de la imagen (${sizeMB}MB) excede el límite máximo de 5MB.`,
            size,
            type
        };
    }

    return {
        isValid: true,
        size,
        type
    };
}

export const photoValidator = {
    validateImage,
    getImageSize,
    getImageType
};
