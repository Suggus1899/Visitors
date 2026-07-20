import type { Config } from 'tailwindcss';
import sharedConfig from '../../packages/config/tailwind.config';

export default {
    presets: [sharedConfig],
    content: [
        './src/**/*.{js,ts,jsx,tsx}',
        './app/**/*.{js,ts,jsx,tsx}',
        '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    ],
} satisfies Config;
