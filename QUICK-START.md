# Quick Start Guide

## The Issue You're Experiencing

You're seeing: **"Cannot read properties of undefined (reading 'auth')"**

**Why:** You're viewing the app in a web browser (http://localhost:3000), but this is an **Electron desktop application** that needs special APIs only available inside Electron.

---

## ✅ Solution: Run in Electron

### Current Status
✅ Dev server is running (Terminal with `npm run dev`)
✅ TypeScript compiled successfully (0 errors)
✅ Vite ready at http://localhost:3000
❌ You need to start Electron now!

### What You Need To Do

**Open a NEW terminal** (keep the current one running) and run:

```bash
cd c:\Users\micro\Repositories\parkstay-bookings
npm start
```

This will:
1. Launch the Electron application
2. Open a desktop window
3. Automatically load your React app from the Vite dev server
4. Provide all the `window.api` methods your app needs

**The Electron window will look like a desktop app, not a browser!**

---

## What's Happening Now

### Browser View (Current - Won't Work)
- ❌ Running at: http://localhost:3000 in Chrome/Edge/Firefox
- ❌ Error: `window.api is undefined`
- ❌ Preload script not loaded (browser doesn't support this)
- ❌ No access to Electron APIs

### Electron View (What You Need)
- ✅ Desktop application window
- ✅ `window.api` exposed via preload script
- ✅ Full access to database and services
- ✅ Authentication works correctly
- ✅ All features enabled

---

## Step-by-Step Instructions

### If This Is Your First Time Running:

1. **Keep the current terminal running** (the one with `npm run dev`)

2. **Open a SECOND terminal:**
   - Windows: Press `Win+R`, type `cmd`, press Enter
   - Or: Open a new tab in your current terminal

3. **Navigate to the project:**
   ```bash
   cd c:\Users\micro\Repositories\parkstay-bookings
   ```

4. **Start Electron:**
   ```bash
   npm start
   ```

5. **Wait for the window to open** (takes 2-5 seconds)

6. **Use the application:**
   - You'll see the login page in the Electron window
   - Enter your ParkStay credentials
   - They will be encrypted and stored locally
   - Start using the app!

---

## Verification

### You'll Know It's Working When:

1. ✅ A **desktop window** opens (not a browser tab)
2. ✅ The window title says **"ParkStay Bookings"**
3. ✅ You can see **Developer Tools** in the View menu
4. ✅ Entering credentials **doesn't show an error** about window.api
5. ✅ The login form submits successfully

### Still See the Browser Error?

If you're still seeing the `window.api` error:
- **You're looking at the wrong window!**
- Close the browser tab at http://localhost:3000
- Look for the Electron desktop window
- If you don't see it, run `npm start` again

---

## Current Browser View Message

When you reload http://localhost:3000 in your browser now, you'll see a helpful yellow warning box that says:

> **This application must run in Electron.**
>
> To run this application:
> 1. Keep this dev server running (don't stop it)
> 2. Open a new terminal
> 3. Run: `npm start`
> 4. The Electron app will open automatically

This is intentional - it helps prevent confusion!

---

## What Each Terminal Does

### Terminal 1 (Currently Running)
```bash
npm run dev
```
**Purpose:** Development servers
- Compiles TypeScript (main process)
- Runs Vite dev server (React UI)
- Enables hot module replacement
- Watches for file changes

**Keep this running!** Don't close this terminal.

### Terminal 2 (What You Need to Start)
```bash
npm start
```
**Purpose:** Electron application
- Launches the desktop app
- Loads UI from Terminal 1's Vite server
- Provides database access
- Enables all features

**This creates the actual desktop window you'll use.**

---

## Architecture Diagram

```
┌────────────────────────────────────────┐
│ Terminal 1: npm run dev                │
│ ┌────────────────────────────────────┐ │
│ │ Vite Dev Server                    │ │
│ │ http://localhost:3000              │ │
│ │ - Serves React UI                  │ │
│ │ - Hot reload                       │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
                  ↓
                Loads
                  ↓
┌────────────────────────────────────────┐
│ Terminal 2: npm start                  │
│ ┌────────────────────────────────────┐ │
│ │ Electron Desktop Window            │ │
│ │ ┌────────────────────────────────┐ │ │
│ │ │ Renderer (React from Vite)     │ │ │
│ │ │ - window.api available ✓       │ │ │
│ │ └────────────────────────────────┘ │ │
│ │ ┌────────────────────────────────┐ │ │
│ │ │ Main Process (Node.js)         │ │ │
│ │ │ - Database                     │ │ │
│ │ │ - Services                     │ │ │
│ │ └────────────────────────────────┘ │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## Common Questions

### Q: Why can't I just use the browser?
**A:** Electron provides:
- Local SQLite database
- File system access
- Encrypted credential storage
- Desktop notifications
- Background job scheduling

These features don't work in a browser for security reasons.

### Q: Do I always need two terminals?
**A:** Yes, during development:
- Terminal 1: Development servers (always running)
- Terminal 2: Electron app (restart when needed)

In production, users just double-click the installer - no terminals needed!

### Q: Can I access localhost:3000 in my browser?
**A:** Yes, but only to see the UI preview. Login and features won't work. Always use Electron for actual development.

### Q: The Electron window is blank!
**A:** Make sure Terminal 1 is running and shows:
```
VITE v5.4.21  ready in XXX ms
➜  Local:   http://localhost:3000/
```

If Vite isn't ready, Electron has nothing to load.

---

## Next Steps

1. ✅ **Keep Terminal 1 running** (dev server)
2. ⏳ **Open Terminal 2** and run `npm start`
3. ⏳ **Wait for Electron window** to open
4. ⏳ **Enter credentials** in the Electron window (not browser)
5. ⏳ **Start using the app!**

---

## Need More Help?

- Detailed guide: [HOW-TO-RUN.md](HOW-TO-RUN.md)
- Troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Development guide: [docs/development.md](docs/development.md)

**The fix for your error is simple: Run `npm start` in a new terminal!**
