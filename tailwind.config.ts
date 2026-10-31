import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/** Converte um token CSS (canais HSL) em cor do Tailwind com suporte a opacidade. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '360px',
        // Celular deitado: pouca altura, largura suficiente para duas colunas curtas.
        'landscape-short': { raw: '(orientation: landscape) and (max-height: 500px)' },
      },
      colors: {
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        panel: { DEFAULT: token('panel'), foreground: token('panel-foreground') },
        'pdf-canvas': token('pdf-canvas'),
        diff: {
          added: token('diff-added'),
          'added-bg': token('diff-added-bg'),
          removed: token('diff-removed'),
          'removed-bg': token('diff-removed-bg'),
        },
        annotation: {
          1: token('annotation-1'),
          2: token('annotation-2'),
          3: token('annotation-3'),
          4: token('annotation-4'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      spacing: {
        header: 'var(--header-height)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [animate],
} satisfies Config;
