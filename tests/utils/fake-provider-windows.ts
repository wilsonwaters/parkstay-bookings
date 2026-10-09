/**
 * In-memory provider windows for core tests (`core/accounts/ports.ts`): `FakeOpener` records
 * every window request, and each `FakeWindow` records focus, loads and closes, and replays the
 * pages a test "shows" in it (`navigate`) to the service's listeners.
 */

import type {
  ProviderWindowHandle,
  ProviderWindowKind,
  ProviderWindowNavigation,
  ProviderWindowOpener,
  ProviderWindowRequest,
} from '@main/core/accounts/ports';

/** A window the service opened: records focus, loads and closes; replays navigations. */
export class FakeWindow implements ProviderWindowHandle {
  focused = 0;
  closed = false;
  readonly loads: string[] = [];
  private readonly navigationListeners = new Set<(n: ProviderWindowNavigation) => void>();
  private readonly closedListeners: Array<() => void> = [];

  constructor(
    readonly providerId: string,
    readonly kind: ProviderWindowKind,
    public url: string
  ) {}

  focus(): void {
    this.focused++;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closedListeners.splice(0).forEach((listener) => listener());
  }
  load(url: string): void {
    this.loads.push(url);
    this.url = url;
  }
  currentUrl(): string {
    return this.url;
  }
  onNavigate(listener: (n: ProviderWindowNavigation) => void): () => void {
    this.navigationListeners.add(listener);
    return () => this.navigationListeners.delete(listener);
  }
  onClosed(listener: () => void): void {
    this.closedListeners.push(listener);
  }
  isClosed(): boolean {
    return this.closed;
  }
  /** A committed top-level page, with its HTTP status. */
  navigate(url: string, httpStatus = 200): void {
    this.url = url;
    for (const listener of [...this.navigationListeners]) listener({ url, httpStatus });
  }
}

export class FakeOpener implements ProviderWindowOpener {
  readonly requests: ProviderWindowRequest[] = [];
  readonly windows: FakeWindow[] = [];
  open(request: ProviderWindowRequest): ProviderWindowHandle {
    this.requests.push(request);
    const window = new FakeWindow(request.providerId, request.kind, request.url);
    this.windows.push(window);
    return window;
  }
  find(providerId: string, kind: ProviderWindowKind): ProviderWindowHandle | undefined {
    return this.windows.find((w) => w.providerId === providerId && w.kind === kind && !w.closed);
  }
  closeAll(): void {
    this.windows.forEach((w) => w.close());
  }
  get last(): FakeWindow {
    return this.windows[this.windows.length - 1];
  }
}
