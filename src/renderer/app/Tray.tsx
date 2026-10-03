import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Portal, ToastViewport } from '../components/ui';
import QueueStatus from '../components/QueueStatus';
import UpdateNotification from '../components/UpdateNotification';

/**
 * True while a modal is open. The overlay stack marks `#root` inert for exactly that long
 * (components/ui/OverlayStack.tsx), whichever stack instance opened the modal.
 */
function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    const sync = () => setOpen(root.hasAttribute('inert'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['inert'] });
    return () => observer.disconnect();
  }, []);
  return open;
}

export interface TrayProps {
  /**
   * The update card and queue status call `window.api` themselves (legacy until U5), so the
   * shell leaves them out when the renderer runs outside the app.
   */
  showLegacySlots?: boolean;
}

/**
 * The one bottom-right stack for floating messages, top to bottom: toasts, the update card,
 * queue status. Portalled outside `#root`, so a modal's `inert` never silences it. The column
 * never takes clicks itself (`pointer-events-none`); only the cards in it do.
 *
 * It sits at `z-tray`, under the modal scrim. While a modal is open it rises to `z-toast` so
 * toasts stay readable and clickable above the scrim, and the other slots are hidden (keeping
 * their space, so toasts do not move) until the modal closes.
 */
export function Tray({ showLegacySlots = true }: TrayProps) {
  const modalOpen = useModalOpen();
  return (
    <Portal>
      <div
        data-testid="tray"
        data-modal-open={modalOpen || undefined}
        className={`pointer-events-none fixed bottom-4 right-4 flex w-[23.75rem] max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 ${
          modalOpen ? 'z-toast' : 'z-tray'
        }`}
      >
        <ToastViewport />
        {showLegacySlots && (
          <>
            <TraySlot hidden={modalOpen}>
              <UpdateNotification />
            </TraySlot>
            <TraySlot hidden={modalOpen}>
              <QueueStatus />
            </TraySlot>
          </>
        )}
      </div>
    </Portal>
  );
}

/**
 * A slot adds no box of its own (`display: contents`), so a card that renders nothing leaves
 * no gap in the column. Hidden slots are `inert` and invisible.
 */
function TraySlot({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // React 18 has no `inert` prop.
    ref.current?.toggleAttribute('inert', hidden);
  }, [hidden]);
  return (
    <div ref={ref} className={`contents ${hidden ? '[&>*]:invisible' : ''}`}>
      {children}
    </div>
  );
}

export default Tray;
