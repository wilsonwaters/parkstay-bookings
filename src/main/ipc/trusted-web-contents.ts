/**
 * The webContents allowed to call IPC and to receive events: the app's own windows.
 * A webContents is forgotten when it is destroyed.
 */

/** The part of Electron's `WebContents` this module and `RendererEvents` use. */
export interface WebContentsLike {
  readonly id: number;
  isDestroyed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): unknown;
}

export class TrustedWebContents {
  private readonly contents = new Map<number, WebContentsLike>();

  register(webContents: WebContentsLike): void {
    if (this.contents.has(webContents.id)) return;
    this.contents.set(webContents.id, webContents);
    webContents.once('destroyed', () => this.contents.delete(webContents.id));
  }

  isTrusted(id: number): boolean {
    const webContents = this.contents.get(id);
    return webContents !== undefined && !webContents.isDestroyed();
  }

  list(): WebContentsLike[] {
    return Array.from(this.contents.values());
  }
}
