import { afterAll, expect, it, vi } from 'vitest';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { theDashboard, upcomingDeadlines, upcomingShoots } from '@/weave/dashboard/actions';
import { staffingGaps } from '@/weave/dashboard/shape';

vi.hoisted(async () => {
  if (!globalThis.WebSocket) {
    const { default: WebSocket } = await import('ws');
    vi.stubGlobal('WebSocket', WebSocket);
  }
});
vi.mock('@/weave/studio', () => ({ whoIsAsking: vi.fn() }));

const studios: string[] = [];
const today = '2026-12-29';
const stamp = `${today}T10:00:00Z`;

async function studio(name: string) {
  const { data } = await db.from('studios').insert({ name }).select('id').single().throwOnError();
  studios.push(data.id);
  return data.id as string;
}

afterAll(async () => {
  vi.unstubAllGlobals();
  if (studios.length === 0) return;
  const { data } = await db.from('studios').delete().in('id', studios).select('id').throwOnError();
  expect(data).toHaveLength(studios.length);
});

it('reads the schedule, delivery counts and work queue for the signed-in studio', async () => {
  const studioId = await studio('Dashboard readings test');
  const otherStudioId = await studio('Dashboard isolation test');
  vi.mocked(whoIsAsking).mockResolvedValue({
    studioId, userId: 'test', personId: 'test', studioName: 'Dashboard readings test',
  });

  const { data: crew } = await db.from('people').insert({
    studio_id: studioId, name: 'Studio Crew', joined_at: stamp,
  }).select('id').single().throwOnError();
  const { data: bookings } = await db.from('bookings').insert([
    { studio_id: studioId, occasion: 'Last day', scheduled_for: '2027-01-04', at: null, accepted_at: stamp },
    { studio_id: studioId, occasion: 'Today', scheduled_for: today, at: '10:30', accepted_at: stamp },
    { studio_id: studioId, occasion: 'Finished today', scheduled_for: today, at: '15:00', accepted_at: stamp, turn: 'done' },
    { studio_id: studioId, occasion: 'Undated', accepted_at: stamp },
    { studio_id: studioId, occasion: 'Finished without a date', accepted_at: stamp, turn: 'done' },
    { studio_id: studioId, occasion: 'Outside the window', scheduled_for: '2027-01-05', accepted_at: stamp },
    { studio_id: studioId, occasion: 'Pending', scheduled_for: today, requested_at: stamp },
    { studio_id: otherStudioId, occasion: 'Another studio', scheduled_for: today, accepted_at: stamp },
    { studio_id: otherStudioId, occasion: 'Another request', requested_at: stamp },
    { studio_id: otherStudioId, occasion: 'Another undated booking', accepted_at: stamp },
  ], { defaultToNull: false }).select('id, occasion').throwOnError();
  const bookingId = bookings.find(({ occasion }) => occasion === 'Today')!.id;
  const requestId = bookings.find(({ occasion }) => occasion === 'Pending')!.id;

  const [, { data: gallery }, { data: file }, { data: order }] = await Promise.all([
    db.from('crew').insert({ studio_id: studioId, booking_id: bookingId, person_id: crew.id }).throwOnError(),
    db.from('galleries').insert({
      studio_id: studioId, booking_id: bookingId, name: 'Gallery test', pictures_promised: 3,
    }).select('id').single().throwOnError(),
    db.from('files').insert({
      studio_id: studioId, booking_id: bookingId, name: 'test.jpg', storage_path: `${studioId}/test.jpg`,
    }).select('id').single().throwOnError(),
    db.from('orders').insert({
      studio_id: studioId, booking_id: bookingId, paid_at: stamp,
    }).select('id').single().throwOnError(),
  ]);
  const { data: section } = await db.from('gallery_sections').insert({
    studio_id: studioId, gallery_id: gallery.id, name: 'Gallery',
  }).select('id').single().throwOnError();
  await db.from('gallery_files').insert({
    studio_id: studioId, gallery_id: gallery.id, section_id: section.id, file_id: file.id,
  }).throwOnError();

  const [shoots, dashboard] = await Promise.all([upcomingShoots(today), theDashboard()]);
  expect(shoots).toMatchObject([
    { id: bookingId, on: today, at: '10:30:00', crew: ['Studio Crew'], needsCrew: false },
    { occasion: 'Finished today', needsCrew: false },
    { on: '2027-01-04', at: null, crew: [], needsCrew: true },
  ]);
  expect(staffingGaps(shoots ?? []).map((shoot) => shoot.occasion)).toEqual(['Last day']);
  expect(dashboard).toMatchObject({
    unanswered: [{ id: requestId }],
    unscheduled: [{ occasion: 'Undated' }],
    notHandedOver: [{ galleryId: gallery.id, have: 1 }],
    shortOfPromise: [],
    notSent: [{ id: order.id }],
  });

  await db.from('galleries').update({ shared_at: stamp }).eq('studio_id', studioId)
    .eq('id', gallery.id).throwOnError();
  const afterShare = await theDashboard();
  expect(afterShare?.notHandedOver).toEqual([]);
  expect(afterShare?.shortOfPromise).toMatchObject([{ galleryId: gallery.id, have: 1, promised: 3 }]);
});

it('shows active gallery deadlines in date order for the signed-in studio', async () => {
  const studioId = await studio('Dashboard deadlines test');
  const otherStudioId = await studio('Dashboard deadline isolation test');
  vi.mocked(whoIsAsking).mockResolvedValue({
    studioId, userId: 'test', personId: 'test', studioName: 'Dashboard deadlines test',
  });

  const { data: booking } = await db.from('bookings').insert({ studio_id: studioId })
    .select('id').single().throwOnError();
  const { data: person } = await db.from('people').insert({ studio_id: studioId, name: 'Test client' })
    .select('id').single().throwOnError();
  const { data: galleries } = await db.from('galleries').insert([
    { studio_id: studioId, name: 'Shared gallery', booking_id: booking.id, shared_at: stamp, expires_on: '2027-01-04' },
    { studio_id: studioId, name: 'Unshared gallery', expires_on: today },
    { studio_id: studioId, name: 'Expired gallery', shared_at: stamp, expires_on: '2026-12-28' },
    { studio_id: otherStudioId, name: 'Other gallery', shared_at: stamp, expires_on: today },
  ]).select('id, name').throwOnError();
  const galleryId = galleries.find(({ name }) => name === 'Shared gallery')!.id;

  const selection = { studio_id: studioId, gallery_id: galleryId, person_id: person.id, kind: 'selection', max_items: 3 };
  await db.from('gallery_collections').insert([
    { ...selection, name: 'Client selects', due_on: today },
    { ...selection, name: 'Submitted selects', due_on: today, submitted_at: stamp },
    { ...selection, name: 'Later selects', due_on: '2027-01-05' },
  ]).throwOnError();

  const hub = { studio_id: studioId, gallery_id: galleryId, purpose: 'approval', due_on: '2027-01-02' };
  const { data: requests } = await db.from('gallery_hub_requests').insert([
    { ...hub, title: 'Open approval', status: 'open' },
    { ...hub, title: 'Closed approval', status: 'closed' },
    { ...hub, title: 'Submitted approval', status: 'open' },
    { ...hub, title: 'No collaborators', status: 'open' },
  ]).select('id, title').throwOnError();
  await db.from('gallery_hub_members').insert(
    requests.filter(({ title }) => title !== 'No collaborators').map(({ id, title }) => ({
      studio_id: studioId, request_id: id, person_id: person.id,
      submitted_at: title === 'Submitted approval' ? stamp : null,
    })),
  ).throwOnError();

  const deadlines = await upcomingDeadlines(today);
  expect(deadlines).toMatchObject([
    { kind: 'selection', title: 'Client selects', on: today, gallery: { id: galleryId, bookingId: booking.id } },
    { kind: 'hub', title: 'Open approval', purpose: 'approval', on: '2027-01-02' },
    { kind: 'expiry', title: 'Shared gallery', on: '2027-01-04' },
  ]);
});
