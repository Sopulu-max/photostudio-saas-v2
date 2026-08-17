'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { markNotificationsSeen } from '@/kernel/notifications';
import { isNotifiable } from '@/kernel/notificationKinds';
import type { Notification } from '@/kernel/notificationKinds';

const SOUND_KEY = 'q.notifications.sound';

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
 * Two soft tones, synthesized rather than fetched.
 *
 * A studio hears this while working, so it is deliberately quiet and short:
 * enough to look up, not enough to be the thing you remember about the app.
 * Synthesizing avoids shipping an audio file and the extra request with it.
 */
function playChime(ctx: AudioContext) {
  const at = ctx.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = at + i * 0.11;
    // Shaped rather than switched: an abrupt start or stop on a sine wave
    // clicks, which reads as a glitch instead of a chime.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  }
}

/**
 * What happened that you haven't seen. The list is a projection of the event
 * log, so nothing here is a separate record that could go stale against it.
 *
 * Live: the browser subscribes to inserts on that same log. A new row does not
 * carry its own phrasing — that lives in one registry on the server — so an
 * arrival asks the server to re-derive the list rather than composing a
 * notification client-side from a raw row.
 *
 * Opening the panel marks everything seen: the unread state answers "is there
 * something new", and the answer stops being true the moment you look.
 */
export function NotificationBell({
  items,
  unreadCount,
  organizationId,
  contactId,
}: {
  items: Notification[];
  unreadCount: number;
  organizationId?: string;
  contactId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Held locally so the badge clears on open rather than waiting for the
  // server round-trip and the layout to re-render.
  const [count, setCount] = useState(unreadCount);
  const [soundOn, setSoundOn] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setCount(unreadCount), [unreadCount]);

  // Per device, not per operator: whether audio is welcome depends on where
  // you are sitting, and the browser's own permission for it is per device too.
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_KEY) === 'on';
      setSoundOn(on);
      soundOnRef.current = on;
    } catch { /* private mode — silence is the safe default */ }
  }, []);

  /**
   * An AudioContext, created on demand and kept.
   *
   * Browsers only allow audio after the user has interacted with *this* page
   * load — the preference persisting across reloads does not carry the
   * permission with it. So this is called both from the toggle (a click, which
   * always qualifies) and from the unlock effect below.
   */
  const ensureAudio = useCallback((): AudioContext | null => {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      if (!audioRef.current) audioRef.current = new Ctor();
      audioRef.current.resume?.();
      return audioRef.current;
    } catch {
      return null; // no audio available; the preference still records the intent
    }
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* not worth failing over */ }
    // Turning it on plays it once: that click is the permission browsers want,
    // and hearing it is the only way to know what you just agreed to.
    if (next) {
      const ctx = ensureAudio();
      if (ctx) playChime(ctx);
    }
  };

  /**
   * Arm the audio on the first interaction of each page load, so a preference
   * set yesterday still makes a sound today. Without this the context only
   * ever existed in the session where the toggle was flipped, and every
   * reload silently turned the sound off while still showing it as on.
   */
  useEffect(() => {
    if (!soundOn || audioRef.current) return;
    const arm = () => { ensureAudio(); };
    const opts = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', arm, opts);
    window.addEventListener('keydown', arm, opts);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [soundOn, ensureAudio]);

  const chime = useCallback(() => {
    if (!soundOnRef.current) return;
    // Late creation covers the case where an arrival lands after the page has
    // been interacted with but the listener above already fired and was
    // removed. A context made without any gesture stays suspended and is
    // simply silent, which is the correct failure.
    const ctx = ensureAudio();
    if (ctx) playChime(ctx);
  }, [ensureAudio]);

  // Live arrivals. The filter is server-side on organization_id, and RLS on
  // events means another studio's rows are not deliverable here in any case.
  useEffect(() => {
    if (!organizationId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Realtime authenticates with the session's access token, not the anon
      // key, and the session loads asynchronously from the cookie. Subscribing
      // before it arrives connects the socket as an anonymous visitor — which
      // RLS on events correctly delivers nothing to, silently.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);

      channel = supabase
        .channel(`events:${organizationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter: `organization_id=eq.${organizationId}` },
          (payload: any) => {
            const row = payload?.new;
            if (!row) return;
            // Your own doing is not news — the same rule the server applies, so
            // the badge never flickers for your own click before the refresh
            // lands and removes it again.
            if (contactId && row.actor_id === contactId) return;
            // And the same registry the panel is built from, so a sound can
            // never fire for something that will not appear in it. Most events
            // a studio writes are catalog work, which is activity, not news.
            if (!isNotifiable(row.entity_type, row.action)) return;
            // A burst — a booking writes several events in a row — should be
            // one refresh and one sound, not one of each per row.
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => {
              chime();
              router.refresh();
            }, 400);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [organizationId, contactId, router, chime]);

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
      // Mark seen only up to the newest item actually on screen. Anything that
      // lands while the panel is open is genuinely unseen and keeps its mark.
      const newest = items[0]?.at;
      startTransition(async () => {
        try { await markNotificationsSeen(newest); router.refresh(); } catch { /* the badge is not worth an alert */ }
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
          <div className="q-bell-head">
            <span>What happened</span>
            <button
              className="q-bell-sound"
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Turn the notification sound off' : 'Turn the notification sound on'}
              title={soundOn ? 'Sound on for this device' : 'Sound off'}
            >
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="q-bell-empty">
              No notifications. Bookings, signatures and payments appear here as they occur.
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
