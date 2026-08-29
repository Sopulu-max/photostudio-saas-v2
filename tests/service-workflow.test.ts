import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A service keeps its workflow through an ordinary edit.
 *
 * THE BUG. The edit form was never given the service's workflow, so it opened
 * holding null — and since it sends whatever it holds, saving wrote
 * workflow_id = null. Editing a service for any reason at all, renaming it or
 * adding a deliverable, silently deleted its workflow. With the workflow went
 * every task that would have flowed onto a booking, and with those, any way to
 * put a person on a job.
 *
 * It was invisible because the service page did not draw workflows either, so
 * the thing that vanished had nowhere to be seen vanishing.
 *
 * WHAT THIS PINS. Not the form — a test cannot fill in a form. It pins the
 * contract underneath it: an update that says nothing about the workflow must
 * leave it alone, and one that carries it must keep it. Those are the two the
 * page depends on, and the page passing it across is the third, checked by
 * reading what getService hands the form.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'wf', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'wf', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, updateService, getService } from '@/modules/services/domain';
import { PURGE_ORDER } from './purge';

let serviceId = '';

const WORKFLOW = {
  name: 'Portrait production',
  tasks: [
    { name: 'Shoot', roleName: 'Photographer' },
    { name: 'Cull', roleName: 'Photo Editor' },
    { name: 'Edit', roleName: 'Photo Editor' },
  ],
};

describe('A service keeps its workflow', () => {
  beforeAll(async () => {
    await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'Workflow Studio', status: 'active',
    });
    await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'Workflow Owner',
    });

    const created = await createService({
      name: 'Portrait Session',
      serviceDomain: 'Photography',
      primaryDeliverable: 'Edited image',
      workflow: WORKFLOW,
    } as any);
    serviceId = created.serviceId;
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('is created with the workflow it was given', async () => {
    const service: any = await getService(serviceId);
    expect(service?.workflow?.name, 'the service was created without its workflow').toBe('Portrait production');
    expect((service.workflow.tasks || []).map((t: any) => t.name)).toEqual(['Shoot', 'Cull', 'Edit']);
    // The role on each task is what makes staffing possible later.
    expect(service.workflow.tasks[0].roleName).toBe('Photographer');
  }, 90000);

  it('hands the form exactly what the form expects back', async () => {
    /*
     * The edit page reads `service.workflow` and passes it straight in as
     * `initial.workflow`, which the editor types as WorkflowInput —
     * { name, tasks: [{ name, roleName?, description? }] }. If getService ever
     * stops returning that shape, the form silently opens empty again and the
     * next save wipes it, which is precisely how this bug worked.
     */
    const service: any = await getService(serviceId);
    const wf = service.workflow;
    expect(typeof wf.name).toBe('string');
    expect(Array.isArray(wf.tasks)).toBe(true);
    for (const t of wf.tasks) {
      expect(typeof t.name, 'a task with no name cannot render in the form').toBe('string');
      expect(t).toHaveProperty('roleName');
    }
  }, 90000);

  it('survives an edit that says nothing about it', async () => {
    // Exactly what renaming a service does: no workflow key at all.
    await updateService({ serviceId, name: 'Portrait Session (renamed)' } as any);

    const service: any = await getService(serviceId);
    expect(service?.name).toBe('Portrait Session (renamed)');
    expect(service?.workflow?.name, 'renaming the service deleted its workflow').toBe('Portrait production');
    expect((service.workflow.tasks || []).length).toBe(3);
  }, 90000);

  it('survives an edit that carries it back unchanged', async () => {
    // What the fixed form now sends: the workflow it was handed.
    await updateService({
      serviceId,
      name: 'Portrait Session',
      workflow: WORKFLOW,
    } as any);

    const service: any = await getService(serviceId);
    expect(service?.workflow?.name, 'saving the form deleted the workflow').toBe('Portrait production');
    expect((service.workflow.tasks || []).map((t: any) => t.name)).toEqual(['Shoot', 'Cull', 'Edit']);
  }, 90000);

  it('still lets a studio remove one deliberately', async () => {
    // Null is a real instruction, distinct from absent. Clearing must work, or
    // a workflow could never be taken off a service.
    await updateService({ serviceId, workflow: null } as any);
    const cleared: any = await getService(serviceId);
    expect(cleared?.workflow, 'a workflow could not be removed on purpose').toBeNull();

    // Put it back for anything that runs after this.
    await updateService({ serviceId, workflow: WORKFLOW } as any);
    const restored: any = await getService(serviceId);
    expect(restored?.workflow?.name).toBe('Portrait production');
  }, 90000);
});
