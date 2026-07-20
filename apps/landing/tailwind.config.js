/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'bg-0': '#101417',
                'surface-0': '#0f1418',
                'surface-1': '#151b20',
                'surface-2': '#1b232a',
                'border-0': '#222b33',
                'border-1': '#2e3842',
                'text-1': '#e5edf5',
                'text-2': '#b1bcc6',
                'text-3': '#7c8a97',
                'accent-0': '#4ade80',
                'accent-1': '#22c55e',
                'accent-2': '#15803d',
            },
            fontFamily: {
                display: ['"Saira Condensed"', '"IBM Plex Sans"', 'sans-serif'],
                body: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.6s ease-out forwards',
                'slide-up': 'slideUp 0.6s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};
