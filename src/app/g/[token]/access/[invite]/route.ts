import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { weave as db } from '@/weave/db';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Redeems an opaque invite once and stores only its hash in an HTTP-only cookie. */
export async function GET(request: Request, { params }: {
  params: Promise<{ token: string; invite: string }>;
}) {
  const { token, invite } = await params;
  const { data: gallery } = await db.from('galleries')
    .select('id, studio_id, token, shared_at, expires_on').eq('token', token).maybeSingle();
  const target = new URL(`/g/${token}`, request.url);
  if (!gallery?.shared_at || (gallery.expires_on && gallery.expires_on < new Date().toISOString().slice(0, 10))) {
    return NextResponse.redirect(target);
  }
  const accessTokenHash = hash(invite);
  const { data: participant } = await db.from('gallery_participants')
    .select('id, person_id, status').eq('gallery_id', gallery.id).eq('access_token_hash', accessTokenHash).maybeSingle();
  if (!participant || participant.status === 'revoked') return NextResponse.redirect(target);
  if (participant.status === 'invited') {
    await db.from('gallery_participants').update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', participant.id).eq('gallery_id', gallery.id);
    await db.from('events').insert({
      studio_id: gallery.studio_id, subject_type: 'gallery', subject_id: gallery.id,
      action: 'participant_approved', actor_id: participant.person_id, payload: { participant: participant.id },
    });
  }
  const response = NextResponse.redirect(target);
  response.cookies.set(`weave-gallery-access-${token}`, `invite:${accessTokenHash}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/g/${token}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
