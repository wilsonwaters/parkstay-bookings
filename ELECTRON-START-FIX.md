# Electron Startup Fix

## Problem
When running `npm start`, you got the error:
```
Error launching app
Unable to find Electron app at C:\Users\micro\Repositories\parkstay-bookings
Cannot find module 'C:\users\micro\Repositories\parkstay-bookings\dist\main\index.js'
Please verify that the package.json has a valid "main" entry
```

## Root Cause
TypeScript was compiling files to `dist/main/main/index.js` instead of `dist/main/index.js` because it was preserving the full source directory structure (`src/main/`).

## Solution
Added `rootDir: "src"` to `tsconfig.main.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/main",
    "rootDir": "src",        // ← This fixes the path
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*", "src/preload/**/*"]
}
```

## What This Does
- **Before:** Files from `src/main/index.ts` → `dist/main/main/index.js`
- **After:** Files from `src/main/index.ts` → `dist/main/main/index.js` (correct!)

## How to Run Now

### Step 1: Make sure dev server is running
```bash
# Terminal 1 (should already be running)
npm run dev
```

### Step 2: Build the main process (one-time fix)
```bash
# Terminal 2 (or same terminal in background)
npm run build:main
```

### Step 3: Start Electron
```bash
npm start
```

The Electron window should now open successfully!

## For Future Development

Once you've run `npm run build:main` once, the TypeScript watch mode (`npm run dev`) will keep the files updated automatically. You only need to:

1. Keep `npm run dev` running (Terminal 1)
2. Run `npm start` whenever you want to launch Electron (Terminal 2)

If you make changes to the main process code, just restart Electron (Ctrl+C and `npm start` again).

## Verification

After running `npm run build:main`, you should see:
```bash
$ ls dist/main/
main/     # Contains compiled main process files
preload/  # Contains compiled preload script
shared/   # Contains compiled shared types
```

And specifically:
```bash
$ ls dist/main/main/
index.js          # ← Electron's entry point
database/         # Database code
services/         # Service layer
ipc/              # IPC handlers
utils/            # Utilities
```

Package.json points to: `"main": "dist/main/index.js"`
Actual file location: `dist/main/main/index.js`

Wait, this is still wrong! Let me fix this properly.
