import type { Config } from 'tailwindcss';
import preset from '@acadia/ui/preset';

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // The design system's own classes must be scanned, or its styles are purged.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
