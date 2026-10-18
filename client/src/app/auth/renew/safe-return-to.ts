const localOrigin = 'https://logmaster.invalid';

export function safeReturnTo(requested: string | undefined): string {
  if (!requested?.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) return '/';
  try {
    const url = new URL(requested, localOrigin);
    if (url.origin !== localOrigin || url.pathname.startsWith('//') || /%(?:2f|5c)/i.test(url.pathname)) return '/';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}
