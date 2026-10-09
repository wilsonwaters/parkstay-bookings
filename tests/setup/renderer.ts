/**
 * Setup for the `renderer` Jest project (testEnvironment: jsdom).
 *
 * Runs as a `setupFilesAfterEnv` entry, once per test file, before the test file loads.
 */

import '@testing-library/jest-dom';
import { configure as configureUserEventDom } from '@testing-library/dom';
import { getConfig as getReactTestingLibraryConfig } from '@testing-library/react';
import { createMockWindowApi } from '../utils/window-api';

// user-event resolves the top-level @testing-library/dom (v10), while @testing-library/react
// configures its own nested copy (v9) to wrap events in act(). Without this, events fired by
// user-event are not act()-wrapped: state updates are not flushed, and under fake timers they
// never flush at all. Give the top-level copy React Testing Library's own wrappers.
const { asyncWrapper, eventWrapper } = getReactTestingLibraryConfig();
configureUserEventDom({ asyncWrapper, eventWrapper });

function installMockWindowApi(): void {
  Object.defineProperty(window, 'api', {
    value: createMockWindowApi(),
    configurable: true,
    writable: true,
  });
}

// Installed now, so modules that touch `window.api` at import find it, and again before
// every test, so stubs never leak from one test into the next. No method is stubbed:
// calling one rejects with an error naming it. Stub what a test needs in the test itself
// or in a `beforeEach`; stubs made at module scope or in `beforeAll` are replaced.
installMockWindowApi();
beforeEach(installMockWindowApi);
// Explore remembers its list position in sessionStorage; each test starts without it.
beforeEach(() => window.sessionStorage.clear());
