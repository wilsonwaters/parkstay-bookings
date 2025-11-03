# Troubleshooting Guide

## Development Server Issues

### Port 3000 Shows 404 Error

**Problem:** Accessing http://localhost:3000 shows a 404 error.

**Solution:** This was caused by Vite not finding the correct root directory.

**Fixed by:**
1. Setting `root: './src/renderer'` in `vite.config.ts`
2. Adjusting `outDir` to `'../../dist/renderer'` to account for the new root

**Current Configuration:**
```typescript
export default defineConfig({
  root: './src/renderer',  // Vite serves from this directory
  build: {
    outDir: '../../dist/renderer',  // Output relative to root
  },
  // ...
});
```

### Port Already in Use

**Problem:** When running `npm run dev`, you see:
```
Port 3000 is in use, trying another one...
```

**Solution:**
```bash
# Windows: Kill all Node processes
taskkill /F /IM node.exe

# Or find and kill specific port
netstat -ano | findstr :3000
taskkill /F /PID <PID>

# Then restart
npm run dev
```

### Multiple Dev Servers Running

**Problem:** Multiple instances of dev server on ports 3000, 3001, 3002, etc.

**Solution:**
1. Stop all running dev servers (Ctrl+C in terminals)
2. Kill any orphaned Node processes (see above)
3. Start fresh: `npm run dev`

## TypeScript Compilation Errors

### Error: Cannot find name 'logger'

**Problem:** `logger` used but not imported in main process files.

**Solution:** Add import:
```typescript
import { logger } from './utils/logger';
```

### Error: Module has no exported member 'APIResponse'

**Problem:** `APIResponse` type not exported from shared types.

**Solution:** Already fixed in `src/shared/types/api.types.ts`:
```typescript
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### Error: Cannot find module 'WatchRepository'

**Problem:** New repositories not exported from index.

**Solution:** Already fixed in `src/main/database/repositories/index.ts`:
```typescript
export * from './watch.repository';
export * from './stq.repository';
export * from './notification.repository';
```

## React/UI Issues

### Blank Page on Load

**Possible Causes:**
1. JavaScript error in console - check browser DevTools
2. Wrong entry point path in `index.html`
3. Build artifacts from previous builds

**Solutions:**
1. Check browser console for errors (F12)
2. Verify `index.html` has correct script tag:
   ```html
   <script type="module" src="/main.tsx"></script>
   ```
3. Clear dist folder:
   ```bash
   npm run clean
   npm run dev
   ```

### Hot Module Replacement (HMR) Not Working

**Problem:** Changes to React files don't refresh automatically.

**Solutions:**
1. Check Vite server is running in terminal
2. Check browser console for HMR errors
3. Restart dev server
4. Hard refresh browser (Ctrl+Shift+R)

## Database Issues

### Database File Not Found

**Problem:** Error about missing database file on first run.

**Solution:** Database is created automatically on first run. If you see this error:
1. Check `userData` directory exists
2. Ensure write permissions
3. Check logs in console for specific error

**Database Location:**
- Windows: `%APPDATA%/parkstay-bookings/data/parkstay.db`
- macOS: `~/Library/Application Support/parkstay-bookings/data/parkstay.db`
- Linux: `~/.config/parkstay-bookings/data/parkstay.db`

### Migration Errors

**Problem:** Database migration fails on startup.

**Solutions:**
1. Check database file isn't locked by another process
2. Delete database file and restart (will recreate)
3. Check console logs for specific SQL errors

## Electron Issues

### Main Process Won't Start

**Problem:** `npm start` fails or shows errors.

**Solutions:**
1. Ensure compilation succeeded: `npm run build:main`
2. Check for TypeScript errors: `tsc -p tsconfig.main.json`
3. Check main process logs in terminal
4. Verify `package.json` has correct main entry:
   ```json
   "main": "dist/main/index.js"
   ```

### Renderer Process Won't Load

**Problem:** Electron window opens but shows blank page.

**Solutions:**
1. Check Vite dev server is running on port 3000
2. Open DevTools in Electron window (View → Toggle Developer Tools)
3. Check for CORS errors (shouldn't happen with Electron)
4. Verify `ELECTRON_RENDERER_URL` environment variable

## Build Issues

### Build Fails with Module Errors

**Problem:** `npm run build` fails with import errors.

**Solutions:**
1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Clear TypeScript cache:
   ```bash
   rm -rf dist
   ```
3. Check all imports use correct aliases (@renderer, @shared)

### Electron Builder Fails

**Problem:** `npm run build:win` or `npm run build:mac` fails.

**Solutions:**
1. Ensure all dependencies are installed
2. Check you have required build tools:
   - Windows: Visual Studio Build Tools
   - macOS: Xcode Command Line Tools
3. Check disk space (builds can be large)
4. Review `electron-builder.json` configuration

## Common Warnings (Safe to Ignore)

### Vite CJS API Deprecation Warning

```
The CJS build of Vite's Node API is deprecated.
```

**Status:** Safe to ignore. This is a known warning in Vite 5.4.21 and doesn't affect functionality.

### util._extend Deprecation Warning

```
[DEP0060] DeprecationWarning: The util._extend API is deprecated.
```

**Status:** Safe to ignore. This comes from a dependency and doesn't affect the application.

## Getting Help

If you're still experiencing issues:

1. **Check logs:**
   - Terminal output from dev server
   - Browser DevTools console
   - Electron main process logs

2. **Verify setup:**
   ```bash
   node --version  # Should be 18+
   npm --version   # Should be 9+
   ```

3. **Clean install:**
   ```bash
   rm -rf node_modules package-lock.json dist
   npm install
   npm run dev
   ```

4. **Check documentation:**
   - [docs/development.md](docs/development.md)
   - [docs/architecture/](docs/architecture/)
   - [FIXES.md](FIXES.md)

## Quick Reference

### Development Commands
```bash
npm run dev          # Start dev servers (Vite + TypeScript watch)
npm start           # Start Electron app (requires dev server running)
npm run build       # Build both main and renderer
npm test           # Run tests
npm run lint       # Lint code
```

### Useful Development URLs
- Vite Dev Server: http://localhost:3000
- React DevTools: Install Chrome extension
- Electron DevTools: Built-in (View → Toggle Developer Tools)

### File Locations
- Main process: `src/main/`
- Renderer process: `src/renderer/`
- Shared code: `src/shared/`
- Build output: `dist/`
- Database: `%APPDATA%/parkstay-bookings/data/` (Windows)
