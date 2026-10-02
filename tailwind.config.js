/**
 * Tailwind maps utility names onto the CSS variables in src/renderer/styles/tokens.css.
 * Values live in tokens.css only; rules live in docs/design/design-language.md.
 */

/** A colour utility backed by an RGB-triple token, so `bg-accent/10` works. */
const color = (token) => `rgb(var(--ws-${token}) / <alpha-value>)`;
const v = (token) => `var(--ws-${token})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: color('canvas'),
        surface: {
          DEFAULT: color('surface'),
          subtle: color('surface-subtle'),
          inverse: color('surface-inverse'),
        },
        fg: {
          DEFAULT: color('fg'),
          secondary: color('fg-secondary'),
          muted: color('fg-muted'),
          inverse: color('fg-inverse'),
        },
        border: {
          DEFAULT: color('border'),
          strong: color('border-strong'),
        },
        brand: {
          DEFAULT: color('brand'),
          strong: color('brand-strong'),
          subtle: color('brand-subtle'),
        },
        accent: {
          DEFAULT: color('accent'),
          hover: color('accent-hover'),
          subtle: color('accent-subtle'),
          fg: color('accent-fg'),
        },
        focus: color('focus'),
        available: {
          DEFAULT: color('available'),
          subtle: color('available-subtle'),
          fg: color('available-fg'),
        },
        warning: {
          subtle: color('warning-subtle'),
          fg: color('warning-fg'),
        },
        danger: {
          DEFAULT: color('danger'),
          subtle: color('danger-subtle'),
          fg: color('danger-fg'),
        },
        sun: {
          DEFAULT: color('sun'),
          subtle: color('sun-subtle'),
        },

        // legacy: delete when U-stream lands.
        // The old sky-blue `primary` scale, re-pointed at ocean so the legacy pages
        // still render. New code must use the semantic names above (the token guard
        // test rejects `primary-*` outside legacy folders).
        primary: {
          50: color('ocean-50'),
          100: color('ocean-100'),
          200: color('ocean-200'),
          300: color('ocean-200'),
          400: color('ocean-500'),
          500: color('ocean-500'),
          600: color('ocean-600'),
          700: color('ocean-700'),
          800: color('ocean-700'),
          900: color('ocean-700'),
        },
      },
      borderColor: {
        DEFAULT: color('border'),
      },
      fontFamily: {
        sans: v('font-sans'),
        display: v('font-display'),
      },
      fontSize: {
        xs: [v('text-xs'), { lineHeight: v('leading-xs') }],
        sm: [v('text-sm'), { lineHeight: v('leading-sm') }],
        base: [v('text-base'), { lineHeight: v('leading-base') }],
        lg: [v('text-lg'), { lineHeight: v('leading-lg') }],
        xl: [v('text-xl'), { lineHeight: v('leading-xl') }],
        '2xl': [v('text-2xl'), { lineHeight: v('leading-2xl'), letterSpacing: '-0.01em' }],
        'display-sm': [
          v('text-display-sm'),
          { lineHeight: v('leading-display-sm'), letterSpacing: '-0.01em' },
        ],
        'display-md': [
          v('text-display-md'),
          { lineHeight: v('leading-display-md'), letterSpacing: '-0.015em' },
        ],
        'display-lg': [
          v('text-display-lg'),
          { lineHeight: v('leading-display-lg'), letterSpacing: '-0.02em' },
        ],
      },
      borderRadius: {
        sm: v('radius-sm'),
        md: v('radius-md'),
        lg: v('radius-lg'),
        xl: v('radius-xl'),
        '2xl': v('radius-2xl'),
        full: v('radius-full'),
      },
      boxShadow: {
        card: v('shadow-card'),
        pill: v('shadow-pill'),
        pop: v('shadow-pop'),
        modal: v('shadow-modal'),
      },
      transitionDuration: {
        fast: v('duration-fast'),
        base: v('duration-base'),
        slow: v('duration-slow'),
      },
      transitionTimingFunction: {
        standard: v('ease-standard'),
      },
      zIndex: {
        header: v('z-header'),
        tray: v('z-tray'),
        overlay: v('z-overlay'),
        toast: v('z-toast'),
        tooltip: v('z-tooltip'),
      },
      keyframes: {
        shimmer: {
          from: { backgroundPosition: '100% 0' },
          to: { backgroundPosition: '-100% 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-in': `fade-in ${v('duration-base')} ${v('ease-standard')} both`,
        'scale-in': `scale-in ${v('duration-base')} ${v('ease-standard')} both`,
      },
    },
  },
  plugins: [],
};
