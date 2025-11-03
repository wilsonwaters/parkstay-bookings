# How to Run the Application

## ⚠️ Important: This is an Electron App

This application is **NOT** meant to be viewed in a regular web browser. It must run inside **Electron** to function correctly.

If you're seeing an error about `window.api` being undefined, you're trying to view it in a browser. Follow the instructions below instead.

---

## Quick Start (Development)

### Step 1: Install Dependencies (First Time Only)
```bash
npm install
```

### Step 2: Start Development Servers

**Terminal 1** - Start the Vite dev server:
```bash
npm run dev
```

Wait until you see:
```
VITE v5.4.21  ready in XXX ms
➜  Local:   http://localhost:3000/
```

**Terminal 2** - Start Electron:
```bash
npm start
```

The Electron window will open automatically and load your app!

---

## Common Issues

### Error: "Cannot read properties of undefined (reading 'auth')"

**Cause:** You're viewing http://localhost:3000 in a browser instead of Electron.

**Solution:**
1. Don't open http://localhost:3000 in your browser
2. Instead, run `npm start` in a separate terminal
3. Electron will automatically load the app

### Port 3000 Already in Use

**Solution:**
```bash
# Windows
taskkill /F /IM node.exe

# Then restart
npm run dev
```

### Electron Window Shows Blank Page

**Causes & Solutions:**
1. **Vite dev server not running:**
   - Make sure `npm run dev` is running in another terminal
   - Check that it shows the VITE ready message

2. **Port changed:**
   - If Vite shows port 3001 instead of 3000, update `src/main/index.ts`:
   ```typescript
   mainWindow.loadURL('http://localhost:3001'); // Change port
   ```

3. **Build errors:**
   - Check Terminal 1 for TypeScript compilation errors
   - All errors must be fixed before Electron can run

### Database Errors on First Run

**Normal behavior:** On first run, the app creates a new database automatically. This is expected.

**If you see errors:**
1. Check the terminal output for specific error messages
2. Ensure you have write permissions in your user directory
3. Check logs in:
   - Windows: `%APPDATA%\parkstay-bookings\logs\`
   - macOS: `~/Library/Application Support/parkstay-bookings/logs/`

---

## Building for Production

### Build the Application
```bash
# Build both main and renderer
npm run build
```

### Create Installer

**Windows:**
```bash
npm run build:win
```

Output: `dist/WA-ParkStay-Bookings-Setup-1.0.0.exe`

**macOS:**
```bash
npm run build:mac
```

Output: `dist/WA-ParkStay-Bookings-1.0.0.dmg`

**Linux:**
```bash
npm run build:linux
```

Output: `dist/WA-ParkStay-Bookings-1.0.0.AppImage`

---

## Development Workflow

### Typical Development Session

1. **Morning: Start dev environment**
   ```bash
   # Terminal 1
   npm run dev

   # Terminal 2 (after Vite is ready)
   npm start
   ```

2. **During development:**
   - Edit files in `src/renderer/` (React UI) - Hot reload automatic
   - Edit files in `src/main/` (Electron) - Restart Electron (Ctrl+C, then `npm start`)
   - Changes are compiled automatically by TypeScript watch mode

3. **End of day: Stop dev environment**
   - Terminal 1: Press Ctrl+C (stops Vite)
   - Terminal 2: Press Ctrl+C or close Electron window

### Opening DevTools

While Electron is running:
- **Windows/Linux:** Press `F12` or `Ctrl+Shift+I`
- **macOS:** Press `Cmd+Option+I`
- Or: View menu → Toggle Developer Tools

---

## Understanding the Architecture

```
┌─────────────────────────────────────┐
│         Electron App                │
│  ┌─────────────────────────────┐   │
│  │   Main Process (Node.js)    │   │
│  │  - Database                 │   │
│  │  - Services                 │   │
│  │  - IPC Handlers             │   │
│  └─────────────────────────────┘   │
│              ↕ IPC                  │
│  ┌─────────────────────────────┐   │
│  │  Renderer Process (React)   │   │
│  │  - UI Components            │   │
│  │  - Pages                    │   │
│  │  - Loads from Vite dev      │   │
│  │    server in development    │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘

Development:
  Renderer loads from: http://localhost:3000 (Vite)

Production:
  Renderer loads from: file://dist/renderer/index.html
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start Vite dev server + TypeScript watch |
| `npm start` | Start Electron app (requires dev server) |
| `npm run build` | Build main + renderer for production |
| `npm run build:win` | Create Windows installer |
| `npm run build:mac` | Create macOS DMG |
| `npm run build:linux` | Create Linux AppImage |
| `npm test` | Run tests |
| `npm run lint` | Lint code |
| `npm run format` | Format code with Prettier |

---

## Environment Variables

Create a `.env` file (optional):

```env
# Development
NODE_ENV=development
ELECTRON_RENDERER_URL=http://localhost:3000

# Production
# NODE_ENV=production
```

---

## Debugging

### Main Process (Electron/Node.js)
- Use `console.log()` - output appears in the terminal where you ran `npm start`
- Or use VS Code debugger (see `.vscode/launch.json`)

### Renderer Process (React)
- Use browser DevTools (F12)
- `console.log()` output appears in DevTools console
- React DevTools extension works normally

### Database Issues
- Check logs: `%APPDATA%\parkstay-bookings\logs\app.log`
- Database location: `%APPDATA%\parkstay-bookings\data\parkstay.db`
- Use DB Browser for SQLite to inspect database manually

---

## Getting Help

1. **Check error messages** in both terminals (dev server and Electron)
2. **Open browser DevTools** in Electron window (F12)
3. **Check log files** in user data directory
4. **Review documentation:**
   - [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
   - [docs/development.md](docs/development.md)
5. **Common fixes:**
   - Delete `node_modules` and `dist`, run `npm install`
   - Kill all Node processes and restart
   - Check that ports 3000 is available

---

## Next Steps

Once you have the app running:

1. **Enter your ParkStay credentials** (encrypted and stored locally)
2. **View existing bookings** (if you have any)
3. **Set up watches** to monitor campground availability
4. **Try Skip The Queue** to book popular dates

Enjoy using WA ParkStay Bookings!
