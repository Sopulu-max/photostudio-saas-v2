'use client';

import React from 'react';
import { stageBadgeClass } from '@/components/stageBadge';
import { Analysis, type Order } from '@/components/Analysis';
import { SheetRow, initialsFor, type SheetItem } from '@/components/Sheet';
import type { TasksSheet, TaskRow } from '@/modules/production/interface';

/**
 * THE TASKS SHEET. Every task on every live booking, read as simple data
 * analysis (components/Analysis) over the axes readTasksSheet decided:
 * status, person, role, task, service, package, stage, when, booking.
 * This file says only what a task row looks like and how rows order.
 *
 * The person is the row's figure - the one scalar a task sheet compares
 * down the column - and "Nobody" takes the warm colour, since that is the
 * thing to see.
 */

function byBooking(a: TaskRow, b: TaskRow, dir: 1 | -1) {
  const ad = a.booking.scheduledFor, bd = b.booking.scheduledFor;
  const d = !ad && !bd ? 0 : !ad ? 1 : !bd ? -1 : String(ad).localeCompare(String(bd)) * dir;
  return d || a.booking.title.localeCompare(b.booking.title) || a.position - b.position;
}

const ORDERS: Order<TaskRow>[] = [
  { key: 'soon', label: 'Soonest booking first', compare: (a, b) => byBooking(a, b, 1) },
  { key: 'late', label: 'Latest booking first', compare: (a, b) => byBooking(a, b, -1) },
  { key: 'person', label: 'By person', compare: (a, b) => (a.assignee?.name || '￿').localeCompare(b.assignee?.name || '￿') || byBooking(a, b, 1) },
  { key: 'task', label: 'By task', compare: (a, b) => a.name.localeCompare(b.name) || byBooking(a, b, 1) },
];

export function TasksBook({ sheet }: { sheet: TasksSheet }) {
  const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const item = (t: TaskRow): SheetItem => ({
    id: t.id,
    href: `/bookings/${t.booking.id}#work`,
    name: t.name,
    // The booking first - a task is read as "Shoot, for Ngozi's wedding" - then
    // when, then the service. The package is an axis, not caption.
    caption: [
      t.booking.title,
      when(t.booking.scheduledFor),
      t.fromService,
      t.role && !t.assignee ? `needs a ${t.role.name}` : null,
    ],
    absent: 'On a booking with no date',
    frame: t.assignee
      ? { url: t.assignee.avatarUrl, initials: initialsFor(t.assignee.name) }
      : { initials: '—' },
    figure: t.done
      ? { text: 'Done', none: true }
      : t.assignee
        ? { text: t.assignee.name }
        : { text: 'Nobody', due: true },
    badge: t.booking.stage
      ? <span className={`q-badge ${stageBadgeClass(t.booking.stage)}`}>{t.booking.stage.name}</span>
      : undefined,
    dim: t.done,
  });

  return (
    <Analysis
      rows={sheet.rows}
      lenses={sheet.lenses}
      orders={ORDERS}
      searchIn={(t) => [t.name, t.assignee?.name, t.role?.name, t.fromService, t.fromPackage, t.booking.title, t.booking.clientName]}
      searchPlaceholder="Search by task, person, service, package or booking"
      noun="task"
      defaultGroup="person"
      empty="No tasks yet — live bookings whose packages define steps will appear here."
      render={(t) => <SheetRow item={item(t)} />}
    />
  );
}
