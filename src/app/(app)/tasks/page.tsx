import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readTasksSheet } from '@/modules/production/interface';
import { TasksBook } from './TasksBook';

export const dynamic = 'force-dynamic';

/**
 * TASKS. Every task on every live booking - the workflow's step as it is
 * now, with what happened on this booking laid over it - read as simple
 * data analysis: narrowed by search, dates and a select per axis; grouped
 * by any axis with its distribution above. Grouped by person it is who is
 * carrying what; Person: nobody is where the studio is short; grouped by
 * booking it is each job's work, task by task. Nothing on this page is
 * stored anywhere; it is the tasks, read (readTasksSheet). The view is
 * the URL.
 *
 * This replaced two fixed readings (by job, by person) and a fixed
 * "nobody on it" section - three of the views the instrument now gives
 * for any axis.
 */
export default async function TasksPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const sheet = await readTasksSheet();

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Tasks</h1>
          <p className="q-page-subtitle">Every task on every live booking: who is on it, and whether it is done.</p>
        </div>
      </header>

      {/* The sheet reads its view from the URL; the boundary is what useSearchParams asks for. */}
      <Suspense fallback={null}>
        <TasksBook sheet={sheet} />
      </Suspense>
    </div>
  );
}
