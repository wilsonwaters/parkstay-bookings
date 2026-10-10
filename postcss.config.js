/**
 * Tailwind 4 runs as a PostCSS plugin. Its configuration is CSS-first, in
 * src/renderer/styles/index.css. (@tailwindcss/vite is ESM-only, which this CommonJS
 * vite.config.ts cannot load on Vite 5.)
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
