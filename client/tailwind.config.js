/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate';

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--surface-1)', foreground: 'var(--text-1)', input: 'var(--border-1)', ring: 'var(--accent-0)',
                primary: 'var(--accent-0)', 'primary-foreground': 'var(--bg-0)',
                secondary: 'var(--surface-2)', 'secondary-foreground': 'var(--text-1)',
                muted: 'var(--surface-2)', 'muted-foreground': 'var(--text-3)',
                accent: 'var(--surface-2)', 'accent-foreground': 'var(--text-1)',
                destructive: '#ef4444', 'destructive-foreground': '#ffffff',
            },
        },
    },
    plugins: [animate],
}
