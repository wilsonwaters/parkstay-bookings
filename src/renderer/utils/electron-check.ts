/**
 * Electron Environment Check
 * Utilities to check if running in Electron and handle gracefully
 */

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && typeof window.api !== 'undefined';
};

export const requireElectron = (): void => {
  if (!isElectron()) {
    throw new Error(
      'This application must be run inside Electron. Please run "npm start" to launch the Electron app.'
    );
  }
};

export const getApi = () => {
  if (!isElectron()) {
    console.error(
      'API is not available. This app must be run in Electron.\n' +
        'Steps to run:\n' +
        '1. Open a terminal and run: npm run dev\n' +
        '2. Open another terminal and run: npm start\n' +
        '3. The Electron window will open automatically'
    );
    return null;
  }
  return window.api;
};
