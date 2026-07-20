import '@testing-library/jest-dom';

// jsdom 28 + vitest 4 may expose `localStorage`/`sessionStorage` as empty objects
// without a working Storage implementation. Provide an in-memory fallback so
// tests that rely on Web Storage work consistently.
const ensureStorage = (name: 'localStorage' | 'sessionStorage'): void => {
  const existing = (window as unknown as Record<string, unknown>)[name];
  if (existing && typeof (existing as Storage).getItem === 'function') {
    return;
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(window, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
};

ensureStorage('localStorage');
ensureStorage('sessionStorage');
