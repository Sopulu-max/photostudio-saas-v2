'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { markNotificationsSeen } from '@/kernel/notifications';
import type { Notification } from '@/kernel/notifications';

function ago(iso: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * What happened that you haven't seen. The list is a projection of the event
 * log, so nothing here is a separate record that could go stale against it.
 *
 * Opening the panel marks everything seen — the unread state answers "is there
 * something new", and the answer stops being true the moment you look.
 */
export function NotificationBell({
  items,
  unreadCount,
}: {
  items: Notification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  // Held locally so the badge clears on open rather than waiting for the
  // server round-trip and the layout to re-render.
  const [count, setCount] = useState(unreadCount);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCount(unreadCount), [unreadCount]);

  // Close on an outside click or Escape, like every other dismissable surface.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      startTransition(async () => {
        try { await markNotificationsSeen(); router.refresh(); } catch { /* the badge is not worth an alert */ }
      });
    }
  };

  return (
    <div ref={boxRef} className="q-bell-wrap">
      <button
        className="q-bell"
        onClick={toggle}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      >
        <Bell size={17} />
        {count > 0 && <span className="q-bell-dot">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className="q-bell-panel">
          <div className="q-bell-head">What happened</div>

          {items.length === 0 ? (
            <div className="q-bell-empty">
              Nothing yet. Bookings, signatures and payments land here as they arrive.
            </div>
          ) : (
            <div className="q-bell-list">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className={`q-bell-item${n.unread ? ' q-bell-item-new' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="q-bell-text">{n.description}</span>
                  <span className="q-bell-time">{ago(n.at)}</span>
                </Link>
              ))}
            </div>
          )}

          <Link href="/overview" className="q-bell-foot" onClick={() => setOpen(false)}>
            Open the Command Center &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
