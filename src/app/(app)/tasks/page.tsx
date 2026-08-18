import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listTasks, listAssignableEmployees, getMyEmployeeId } from '@/modules/production/interface';
import { TasksClient } from './TasksClient';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [tasks, candidates, myEmployeeId] = await Promise.all([
    listTasks(),
    listAssignableEmployees(),
    getMyEmployeeId(),
  ]);

  return (
    <TasksClient
      tasks={tasks}
      candidates={candidates}
      myEmployeeId={myEmployeeId}
    />
  );
}
