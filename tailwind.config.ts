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
        overlay: token('overlay'),
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
        status: {
          online: token('status-online'),
          away: token('status-away'),
          busy: token('status-busy'),
          offline: token('status-offline'),
        },
      },
      // Texto usa tons próprios onde a cor da paleta não tem contraste como texto:
      // text-destructive no escuro e text-success no claro (docs/03-identidade-visual.md).
      textColor: {
        destructive: { DEFAULT: token('destructive-text'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success-text'), foreground: token('success-foreground') },
      },
      // Paleta: lg 9px, md 6px, sm 3px com --radius 0.75rem (12px).
      borderRadius: {
        lg: 'calc(var(--radius) - 3px)',
        md: 'calc(var(--radius) - 6px)',
        sm: 'calc(var(--radius) - 9px)',
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
