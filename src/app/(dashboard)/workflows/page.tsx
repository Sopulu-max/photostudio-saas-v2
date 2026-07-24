import { redirect } from 'next/navigation';

// The old combined "Production Engine" page has been split:
// active pipelines now live at /productions, blueprints at /workflows/templates.
export default function WorkflowsIndexPage() {
  redirect('/workflows/templates');
}
