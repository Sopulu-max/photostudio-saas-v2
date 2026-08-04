import React from 'react';

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

/** A contact's photo, or their initials if they don't have one yet. */
export function ContactAvatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = `q-avatar q-avatar-${size}`;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={url} alt={name} />;
  }
  return <div className={cls}>{initialsFor(name)}</div>;
}
