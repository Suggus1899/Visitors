import toast from 'react-hot-toast';

export const safeNotify = {
  success: (message: string) => {
    try {
      toast.success(message);
    } catch {
      console.log('[Notify]', message);
    }
  },

  error: (message: string) => {
    try {
      toast.error(message);
    } catch {
      console.error('[Notify]', message);
    }
  },

  info: (message: string) => {
    try {
      toast(message, { icon: 'ℹ️' });
    } catch {
      console.info('[Notify]', message);
    }
  },

  warn: (message: string) => {
    try {
      toast(message, { icon: '⚠️' });
    } catch {
      console.warn('[Notify]', message);
    }
  },
};

export default safeNotify;
