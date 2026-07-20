import type { Config } from 'tailwindcss';
import sharedConfig from '../../packages/config/tailwind.config';

export default {
    presets: [sharedConfig],
    content: [
        './app/**/*.{js,ts,jsx,tsx}',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
} satisfies Config;
