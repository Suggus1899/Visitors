/**
 * Triggers a browser download for a binary Blob.
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke after a short delay to ensure the download starts.
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

/**
 * Formats an ISO date string for display.
 */
export const formatDateTime = (dateStr: string, locale = 'en-US'): string => {
    return new Date(dateStr).toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

/**
 * Formats an ISO date string as a short date.
 */
export const formatDate = (dateStr: string, locale = 'en-US'): string => {
    return new Date(dateStr).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

/**
 * Returns today's date as YYYY-MM-DD.
 */
export const todayISO = (): string => new Date().toISOString().split('T')[0];

/**
 * Returns a date N days ago as YYYY-MM-DD.
 */
export const daysAgoISO = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
};
