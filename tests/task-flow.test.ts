import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * Tasks flow from the package onto the booking, carrying the role they need.
 *
 * THE IDEA BEING PINNED. A studio says once how work in a domain gets done —
 * Shoot, Cull, Edit — and which role does each. A service points at that
 * workflow. Bundling the service into a package copies the tasks in. Putting
 * that package on a booking copies them again, onto the booking's own line. So
 * every task on a booking already knows the role it needs, and staffing is then
 * a matter of naming someone who holds it.
 *
 * WHY IT NEEDED A TEST. Not one link in that chain had ever run: the database
 * held zero workflows, zero workflow_tasks, zero package_tasks and zero
 * booking_tasks, so no booking could have anyone on it at all. A chain
 * that has never executed end to end is a chain nobody knows is connected.
 *
 * It also covers the break that would have bitten first — tasks were copied
 * into a package only at the instant a service was bundled, so defining a
 * workflow after building the catalog reached nothing.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'task-flow', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'task-flow', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, saveWorkflow } from '@/modules/services/domain';
import { createPackage } from '@/modules/packages/domain';
import { submitBookingForm } from '@/app/book/[slug]/[packageId]/actions';
import { createBooking } from '@/modules/bookings/domain';
import {
  addToBookingTeam, getBookingTeam, removeFromBookingTeam,
  getBookingTasks, setTaskRole, addBookingTask, removeBookingTask, assignToTask,
} from '@/modules/production/domain';
import { PURGE_ORDER } from './purge';
import { seedStudio, seedRow } from './seed';

let serviceId = '';
let packageId = '';
let bookingId = '';
let photographerRoleId = '';
let employeeId = '';
let employeeContactId = '';

const DOMAIN = 'Photography';

describe('Tasks flow from a package onto a booking', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Task Flow Studio' });

    const created = await createService({
      name: 'Portrait Session', serviceDomain: DOMAIN, primaryDeliverable: 'Edited image',
    });
    serviceId = created.serviceId;

    // Someone who can actually do the work, and holds the role.
    employeeContactId = (await seedRow('contacts',
      { organization_id: TEST_ORG_ID, display_name: 'Ada Shoots' }, 'the contact behind the employee')).id;
    employeeId = (await seedRow('employees',
      { organization_id: TEST_ORG_ID, contact_id: employeeContactId, status: 'active' }, 'the employee')).id;
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('reaches packages that were built before the workflow existed', async () => {
    /*
     * Deliberately the wrong way round: the package is bundled FIRST, while no
     * workflow exists, and the workflow is written afterwards. That is what a
     * studio which built its catalog before thinking about production actually
     * does, and until now it produced a package with no tasks and no way to
     * notice.
     */
    const pkg = await createPackage({ name: 'Golden Hour Portrait', serviceIds: [serviceId] });
    packageId = pkg.packageId;

    const { data: before } = await supabaseAdmin
      .from('package_tasks').select('id').eq('organization_id', TEST_ORG_ID);
    expect(before ?? [], 'a workflow existed before the test wrote one').toHaveLength(0);

    const { data: domain } = await supabaseAdmin
      .from('service_domains').select('id').eq('organization_id', TEST_ORG_ID)
      .eq('name', DOMAIN).single();

    await saveWorkflow(domain!.id, {
      name: 'Portrait production',
      tasks: [
        { name: 'Shoot', roleName: 'Photographer' },
        { name: 'Cull', roleName: 'Photo Editor' },
        { name: 'Edit', roleName: 'Photo Editor' },
      ],
    } as any);

    // The service has to point at the workflow for the sync to reach it.
    const { data: workflow } = await supabaseAdmin
      .from('workflows').select('id').eq('organization_id', TEST_ORG_ID).single();
    await supabaseAdmin.from('services')
      .update({ workflow_id: workflow!.id }).eq('id', serviceId);
    const { syncPackageTasksForWorkflow } = await import('@/modules/packages/domain');
    await syncPackageTasksForWorkflow(workflow!.id);

    const { data: after } = await supabaseAdmin
      .from('package_tasks').select('id, name, role_id').eq('organization_id', TEST_ORG_ID);
    expect((after ?? []).map((t: any) => t.name).sort(), 'the workflow did not reach the package')
      .toEqual(['Cull', 'Edit', 'Shoot']);
    // Every task carries the role it needs — this is what makes staffing possible.
    expect((after ?? []).every((t: any) => t.role_id), 'a task arrived with no role').toBe(true);

    const { data: role } = await supabaseAdmin
      .from('roles').select('id').eq('organization_id', TEST_ORG_ID).eq('name', 'Photographer').single();
    photographerRoleId = role!.id;
    await supabaseAdmin.from('employee_roles')
      .insert({ organization_id: TEST_ORG_ID, employee_id: employeeId, role_id: photographerRoleId });
  }, 90000);

  it('copies them onto the booking when the package is booked', async () => {
    const booked = await createBooking({
      title: 'Ada — Portrait',
      contactId: TEST_PERSON_ID,
      lines: [{ packageId, title: 'Golden Hour Portrait' }],
    });
    bookingId = booked.bookingId;

    const { data: lines } = await supabaseAdmin
      .from('booking_lines').select('id').eq('booking_id', bookingId);
    const { data: tasks } = await supabaseAdmin
      .from('booking_tasks').select('name, role_id, assignee_id')
      .in('booking_line_id', (lines ?? []).map((l: any) => l.id));

    expect((tasks ?? []).map((t: any) => t.name).sort(), 'the booking got no tasks from its package')
      .toEqual(['Cull', 'Edit', 'Shoot']);
    expect((tasks ?? []).every((t: any) => t.role_id), 'a booking task lost its role').toBe(true);
    expect((tasks ?? []).every((t: any) => !t.assignee_id), 'a task arrived already assigned').toBe(true);
  }, 90000);


  it('and onto a booking taken from the public page, which got none at all', async () => {
    /*
     * EVERY PUBLIC BOOKING LANDED WITH AN EMPTY WORK BOARD.
     *
     * Two silent causes. copyPackage carried a package's services, promises,
     * narrowings and fixed variables but not its package_tasks — so the private
     * instance a public booking points at had no work to give. And
     * createBookingFromIntake inserts its line by hand, having no session to
     * call addBookingLine with, and copied no tasks onto it either.
     *
     * Nothing errored either time. The studio received a job with nobody
     * assigned and nothing to tick off, and the only way to see it was to put
     * it beside a booking an operator had taken by hand — which is exactly what
     * this file already does above.
     */
    const { bookingId: publicBookingId } = await submitBookingForm(TEST_ORG_ID, packageId, {
      firstName: 'Uche', lastName: 'Public',
      email: `uche+${Math.random().toString(36).slice(2, 8)}@example.com`,
      phone: '', customFields: {},
    } as any);

    const { data: line } = await supabaseAdmin
      .from('booking_lines').select('id, package_id').eq('booking_id', publicBookingId).single();

    // Its own copy of the package, and that copy carries the work.
    expect(line!.package_id, 'the public booking points at the catalogue').not.toBe(packageId);
    const { data: bundle } = await supabaseAdmin
      .from('package_services').select('package_tasks(id)').eq('package_id', line!.package_id!);
    expect((bundle || []).flatMap((b: any) => b.package_tasks || []).length,
      'the booking’s own copy of the package carries no work').toBeGreaterThan(0);

    // And the work reached the booking, where anyone would look for it.
    const { data: tasks } = await supabaseAdmin
      .from('booking_tasks').select('name').eq('booking_id', publicBookingId);
    expect((tasks ?? []).map((t: any) => t.name).sort(),
      'a booking taken from the public page arrived with an empty work board')
      .toEqual(['Cull', 'Edit', 'Shoot']);
  }, 120000);

  it('puts someone on every task waiting for their role, in one move', async () => {
    const added = await addToBookingTeam({ bookingId, employeeId, roleId: photographerRoleId });

    // One Shoot task needs a Photographer; the two editing tasks do not.
    expect(added.tasksFilled, 'adding a photographer staffed the wrong number of tasks').toBe(1);

    const team = await getBookingTeam(bookingId);
    const photography = team.roles.find((r: any) => r.roleName === 'Photographer');
    expect(photography?.covering.map((p: any) => p.name)).toEqual(['Ada Shoots']);
    expect(photography?.unassigned, 'a photography task was left unstaffed').toBe(0);

    // The editing work is still visibly waiting for someone — the gap a studio
    // needs to see before the day, not on it.
    const editing = team.roles.find((r: any) => r.roleName === 'Photo Editor');
    expect(editing?.unassigned, 'the editing tasks were quietly filled too').toBe(2);
    expect(team.unfilled).toBe(2);
  }, 90000);

  it('does not displace someone already on a task', async () => {
    // A second photographer joins. The first is already on the Shoot.
    const { data: other } = await supabaseAdmin.from('contacts')
      .insert({ organization_id: TEST_ORG_ID, display_name: 'Bode Second' }).select('id').single();
    const { data: otherEmployee } = await supabaseAdmin.from('employees')
      .insert({ organization_id: TEST_ORG_ID, contact_id: other!.id, status: 'active' })
      .select('id').single();
    await supabaseAdmin.from('employee_roles')
      .insert({ organization_id: TEST_ORG_ID, employee_id: otherEmployee!.id, role_id: photographerRoleId });

    const added = await addToBookingTeam({
      bookingId, employeeId: otherEmployee!.id, roleId: photographerRoleId,
    });
    expect(added.tasksFilled, 'a second photographer took over work already assigned').toBe(0);

    const team = await getBookingTeam(bookingId);
    const photography = team.roles.find((r: any) => r.roleName === 'Photographer');
    // Both are on the booking; only the first is on the task.
    expect(photography?.covering.map((p: any) => p.name).sort()).toEqual(['Ada Shoots', 'Bode Second']);
  }, 90000);

  it('hands the work back when someone comes off the booking', async () => {
    const team = await getBookingTeam(bookingId);
    const photography = team.roles.find((r: any) => r.roleName === 'Photographer');
    const ada = photography!.members.find((m: any) => m.person.name === 'Ada Shoots');

    await removeFromBookingTeam({ bookingId, assignmentId: ada!.assignmentId });

    const after = await getBookingTeam(bookingId);
    const stillPhotography = after.roles.find((r: any) => r.roleName === 'Photographer');
    // The task is unassigned again rather than left pointing at someone who is
    // no longer on the job — a visible gap instead of a silent one.
    expect(stillPhotography?.unassigned, 'the task stayed on someone who had left').toBe(1);
    expect(stillPhotography?.covering.map((p: any) => p.name)).toEqual(['Bode Second']);
  }, 90000);

  /*
   * The booking's work as ONE list, across every package on it.
   *
   * A task could only reach a booking through a line, so a booking with three
   * packages had three disconnected task lists and no view of the job as a job.
   * These pin the collated view, the per-booking role override, and work the
   * studio adds itself — which had nowhere to live at all while a task required
   * a package to hang from.
   */
  describe('the work, collated', () => {
    it('gathers every package on the booking into one list', async () => {
      const tasks = await getBookingTasks(bookingId);
      expect(tasks.map((t: any) => t.name).sort()).toEqual(['Cull', 'Edit', 'Shoot']);
      // Each still says what it came from — that is why the list can be flat.
      expect(tasks.every((t: any) => t.fromPackage === 'Golden Hour Portrait')).toBe(true);
    }, 90000);

    it('takes work the studio adds itself, belonging to no package', async () => {
      const { taskId } = await addBookingTask({
        bookingId, name: 'Collect the album from the printer', roleId: null,
      });
      const tasks = await getBookingTasks(bookingId);
      const added = tasks.find((t: any) => t.id === taskId);
      expect(added?.name).toBe('Collect the album from the printer');
      // No package, and no line — the thing the old shape made impossible.
      expect(added?.fromPackage).toBeNull();
      expect(added?.lineId).toBeNull();

      await removeBookingTask({ bookingId, taskId });
      expect((await getBookingTasks(bookingId)).some((t: any) => t.id === taskId)).toBe(false);
    }, 90000);

    it('refuses to drop a task that came from a package', async () => {
      const fromPackage = (await getBookingTasks(bookingId)).find((t: any) => t.lineId);
      await expect(removeBookingTask({ bookingId, taskId: fromPackage!.id }))
        .rejects.toThrow(/comes from a package/i);
    }, 90000);

    it('stands down an assignee who does not hold a newly set role', async () => {
      const shoot = (await getBookingTasks(bookingId)).find((t: any) => t.name === 'Shoot');
      // Unassigned at this point: removing Ada handed it back, and Bode joined
      // after she already held it, so nothing put him on. Put him on now.
      expect(shoot?.assignee, 'the fixture already staffed Shoot').toBeNull();
      const { data: bode } = await supabaseAdmin
        .from('contacts').select('id').eq('organization_id', TEST_ORG_ID)
        .eq('display_name', 'Bode Second').single();
      await assignToTask({ bookingId, taskId: shoot!.id, employeeId: bode!.id });
      expect((await getBookingTasks(bookingId)).find((t: any) => t.id === shoot!.id)?.assignee?.name)
        .toBe('Bode Second');

      const { data: editorRole } = await supabaseAdmin
        .from('roles').select('id').eq('organization_id', TEST_ORG_ID).eq('name', 'Photo Editor').single();

      // Bode is a Photographer, not a Photo Editor. Changing what the task needs
      // must not leave him on work he is not down for.
      const result = await setTaskRole({ bookingId, taskId: shoot!.id, roleId: editorRole!.id });
      expect(result.standDown, 'an unqualified assignee was left on the task').toBe(true);

      const after = (await getBookingTasks(bookingId)).find((t: any) => t.id === shoot!.id);
      expect(after?.roleName).toBe('Photo Editor');
      expect(after?.assignee).toBeNull();
    }, 90000);
  });
});
