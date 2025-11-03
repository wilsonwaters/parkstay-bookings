# Module System Fix

## Problem

When running `npm start`, you got:

```
(node:27468) Warning: To load an ES module, set "type": "module" in the package.json or use the .mjs extension.

SyntaxError: Cannot use import statement outside a module
```

## Root Cause

TypeScript was compiling to **ES Modules** (ESM) with `import`/`export` syntax:

```javascript
import { app, BrowserWindow } from 'electron';
```

But Electron's main process expects **CommonJS** with `require`/`module.exports`:

```javascript
const { app, BrowserWindow } = require('electron');
```

## Solution

Updated `tsconfig.main.json` to use CommonJS modules:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",  // ← Changed from ESNext to CommonJS
    "outDir": "dist/main",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*", "src/preload/**/*"]
}
```

## What This Does

### Before (ES Modules - Doesn't Work in Electron)
```javascript
import { app, BrowserWindow } from 'electron';
export class MyClass { }
```

### After (CommonJS - Works in Electron)
```javascript
const electron_1 = require("electron");
exports.MyClass = class MyClass { }
```

## Why This Matters

- **Electron's main process** runs in Node.js, which traditionally uses CommonJS
- **ES Modules** require either:
  - `"type": "module"` in package.json (breaks other things)
  - `.mjs` file extensions
  - Or native ESM support (Electron 28+ supports this but requires configuration)
- **CommonJS** just works out of the box with Electron

## Files Fixed

1. ✅ `tsconfig.main.json` - Changed module format to CommonJS
2. ✅ Rebuilt `dist/main/` with new settings
3. ✅ Main process now uses `require()` statements

## Verification

Check the compiled file:

```bash
head -10 dist/main/main/index.js
```

You should see:
```javascript
"use strict";
const electron_1 = require("electron");  // ← CommonJS!
```

## Ready to Run

Now you can run:

```bash
npm start
```

Electron should start without module errors!

## For Future Reference

### Main Process (Node.js)
- File: `tsconfig.main.json`
- Module: `CommonJS`
- Output: `dist/main/`
- Uses: `require()`, `module.exports`

### Preload Script (Node.js context)
- File: Part of `tsconfig.main.json`
- Module: `CommonJS`
- Output: `dist/main/preload/`
- Uses: `require()`, `module.exports`

### Renderer Process (Browser)
- File: `tsconfig.renderer.json`
- Module: `ESNext` (OK for browser/Vite)
- Output: Built by Vite
- Uses: `import`, `export`

## Alternative: Using ES Modules

If you wanted to use ES modules in Electron (not recommended for beginners), you'd need to:

1. Add to package.json:
   ```json
   {
     "type": "module",
     "main": "dist/main/main/index.js"
   }
   ```

2. Use `.cjs` extensions for CommonJS dependencies

3. Configure Electron to use ESM

**But CommonJS is simpler and works immediately, so we're using that.**

---

**Status: Fixed! ✅**

Run `npm start` and Electron should now launch successfully!
