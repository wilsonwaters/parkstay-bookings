const { spawn } = require('child_process');
const path = require('path');

// Set environment variable for dev server URL
process.env.ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3005';

// Start Electron
const electron = spawn('npx', ['electron', '.'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

electron.on('close', (code) => {
  process.exit(code);
});
