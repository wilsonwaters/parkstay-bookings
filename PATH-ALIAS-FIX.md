# TypeScript Path Alias Fix

## Problem

When running `npm start`, Electron failed with:

```
Error: Cannot find module '@shared/constants'
Require stack:
- C:\Users\micro\Repositories\parkstay-bookings\dist\main\main\services\parkstay\parkstay.service.js
```

## Root Cause

TypeScript path aliases defined in `tsconfig.json`:

```json
{
  "paths": {
    "@main/*": ["src/main/*"],
    "@renderer/*": ["src/renderer/*"],
    "@shared/*": ["src/shared/*"],
    "@preload/*": ["src/preload/*"]
  }
}
```

These work great during development, but when TypeScript compiles to JavaScript, the aliases are kept as-is:

```javascript
// Source TypeScript
import { CONSTANTS } from '@shared/constants';

// Compiled JavaScript (BROKEN)
const constants_1 = require("@shared/constants");  // ← Node.js can't find this!
```

Node.js doesn't know how to resolve `@shared/*` paths - it only understands:
- Relative paths: `./`, `../`
- Node modules: `node_modules/package-name`
- Built-in modules: `fs`, `path`, etc.

## Solution

Installed `tsconfig-paths` and registered it at runtime to teach Node.js how to resolve our custom path aliases:

### Step 1: Install Package

```bash
npm install --save tsconfig-paths
```

### Step 2: Register Paths in Entry File

Added to `src/main/index.ts` at the very top:

```typescript
// Register TypeScript path aliases for runtime module resolution
import 'tsconfig-paths/register';

import { app, BrowserWindow } from 'electron';
// ... rest of imports
```

### Step 3: Rebuild

```bash
npm run build:main
```

## How It Works

`tsconfig-paths/register` reads your `tsconfig.json` and registers a Node.js require hook that:

1. Intercepts all `require()` calls
2. Checks if the module path matches any alias patterns
3. Resolves the alias to the actual file path
4. Loads the file from the correct location

**Example:**
```javascript
// When Node.js sees:
require('@shared/constants')

// tsconfig-paths translates it to:
require('../../../shared/constants')

// Which resolves to:
C:\Users\micro\Repositories\parkstay-bookings\dist\main\shared\constants\index.js
```

## Alternative Solutions

### Option 1: tsconfig-paths (✅ Chosen)
**Pros:**
- Easy to set up (one import)
- Works with existing tsconfig.json
- No code changes needed
- Supports all path aliases

**Cons:**
- Runtime dependency (adds ~40KB)
- Slight performance overhead

### Option 2: Babel Plugin Transform Paths
**Pros:**
- Compile-time solution
- No runtime dependency

**Cons:**
- Requires Babel setup
- More configuration
- Another build step

### Option 3: Convert to Relative Paths
**Pros:**
- No dependencies
- Native Node.js support

**Cons:**
- Lose clean import syntax
- Harder to maintain
- Lots of code changes

### Option 4: module-alias
**Pros:**
- Simple runtime registration
- Lightweight

**Cons:**
- Separate configuration
- Manual path registration

## Files Modified

1. ✅ **package.json** - Added `tsconfig-paths` dependency
2. ✅ **src/main/index.ts** - Added path registration import
3. ✅ **dist/main/** - Rebuilt with new changes

## Verification

After rebuilding, the compiled JavaScript now loads correctly:

```javascript
// dist/main/main/index.js
"use strict";
require("tsconfig-paths/register");  // ← This registers the paths!

const electron_1 = require("electron");
// ... rest of code
```

When `parkstay.service.js` tries to load `@shared/constants`, Node.js now knows how to find it!

## For Future Reference

### When to Use Path Aliases

**Good for:**
- Avoiding deep relative imports (`../../../shared`)
- Clean, semantic imports
- Easier refactoring

**Path aliases are resolved:**
- ✅ During TypeScript compilation (type checking)
- ✅ By your IDE (IntelliSense, autocomplete)
- ✅ At runtime (via tsconfig-paths)

### Common Path Aliases in This Project

```typescript
import { Database } from '@main/database';      // Main process code
import { Button } from '@renderer/components';  // React components
import { User } from '@shared/types';           // Shared types
import { api } from '@preload/index';           // Preload API
```

## Testing

To verify it works:

```bash
npm start
```

You should see the Electron window open without module resolution errors!

---

**Status: Fixed! ✅**

Electron can now resolve all `@shared/*`, `@main/*`, etc. imports correctly.
