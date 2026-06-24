import { Toaster } from 'react-hot-toast';

export const AppToaster = () => (
  <Toaster
    position="top-center"
    toastOptions={{
      duration: 4000,
      style: {
        background: 'var(--surface-1)',
        color: 'var(--text-1)',
        borderRadius: '10px',
        border: '1px solid var(--border-1)',
      },
      success: { iconTheme: { primary: '#4dd7ff', secondary: '#081116' } },
      error: { iconTheme: { primary: '#ff6b6b', secondary: '#0b0f12' } },
    }}
  />
);

export default AppToaster;
