import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { buildCsp } from './src/main/app/csp';

/**
 * Production CSP (architecture-notes §12.25). The built renderer loads from `file://`, which
 * has no response headers, so the policy goes into `index.html` as the first element of
 * `<head>`. The dev server gets the dev policy as a header from the main process instead.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'wa-stay-content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp({ dev: false }) },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  base: './',
  root: './src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 3000,
  },
});
