/**
 * IPC sender validation (architecture-notes §7). An invoke is allowed only when:
 * - `event.sender` is a webContents registered as trusted (the main window);
 * - `event.senderFrame` exists (it is null while a frame navigates or is destroyed);
 * - that frame is the top frame, not a sub-frame;
 * - the frame's URL is on the app origin (the dev server, or the built `index.html`).
 */

import type { IpcMainInvokeEvent, WebFrameMain } from 'electron';
import type { SenderGuard } from './handle';

export interface SenderGuardOptions {
  isTrustedWebContents(id: number): boolean;
  isAppUrl(url: string): boolean;
}

export function createSenderGuard({
  isTrustedWebContents,
  isAppUrl,
}: SenderGuardOptions): SenderGuard {
  return (event: IpcMainInvokeEvent): boolean => {
    if (!isTrustedWebContents(event.sender.id)) return false;

    const frame: WebFrameMain | null | undefined = event.senderFrame;
    if (!frame) return false;
    if (frame.parent !== null) return false;

    return isAppUrl(frame.url);
  };
}
