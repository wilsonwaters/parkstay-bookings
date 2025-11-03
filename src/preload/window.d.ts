/**
 * Window Type Declaration
 * Extends the Window interface with our API
 */

import { API } from './index';

declare global {
  interface Window {
    api: API;
  }
}

export {};
