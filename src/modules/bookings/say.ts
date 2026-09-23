import type { SheetBooking } from './sheet';

/**
 * SAYING IT - the statement composers (12-BOOKINGS_READABILITY §1).
 *
 * The page carries no key and no labels: every reading announces what it is
 * from inside. A verb says which plane a fragment comes from (shoots · shot ·
 * waiting on · nobody on), a numeral carries the noun it counts, an absence is
 * a clause. These functions are the only place the app's connective words
 * live.
 *
 * Two rules they may not break:
 *
 * 1. THE STUDIO'S WORDS GO IN VERBATIM. A stage name, a role name, a
 *    dimension value, a question label, a package name, a person's name - all
 *    composed in as given, never inflected, pluralised or parsed to make a
 *    sentence flow. `plural()` is for the app's own nouns (day, job, step,
 *    session), never for a studio's.
 * 2. NOTHING IS INFERRED ABOUT A PERSON. No pronoun is ever put on a client or
 *    a crew member: a name is not evidence of anything. Statements are written
 *    so none is needed.
 * 3. PLAIN PROFESSIONAL BUSINESS LANGUAGE, and never the second person. Not
 *    "waiting on you" but "awaiting a studio decision"; not "nobody is on it"
 *    but "unassigned"; not "no proposal out" but "no proposal issued". The
 *    page reports the state of the record; it does not address the reader.
 *
 * Pure: everything arrives on the row (sheet.ts), so a statement is
 * composition and never a second reading of the database.
 */

/** A fragment of a statement: the words, and whether they need the operator. */
export type Part = { t: string; tone?: 'strong' | 'warm' };
export type Say = Part[];

const t = (s: string): Part => ({ t: s });
const strong = (s: string): Part => ({ t: s, tone: 'strong' });
const warm = (s: string): Part => ({ t: s, tone: 'warm' });

/** The app's own nouns only - never a studio's word (rule 1). */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * AGREEMENT. A statement composed from a count has to agree with it, and the
 * article before a studio's word has to fit that word's first sound. Both are
 * the app's own grammar, applied to its own connectives - the studio's word
 * itself is never touched (rule 1).
 */
export const is = (n: number) => (n === 1 ? 'is' : 'are');
export const has = (n: number) => (n === 1 ? 'has' : 'have');
export const verb = (n: number, stem: string) => (n === 1 ? `${stem}s` : stem);
export const them = (n: number) => (n === 1 ? 'it' : 'them');
/** "an Editor", "a Photographer" - chosen to fit the word the studio gave, never imposed on it. */
export const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

/**
 * A quantity with the unit the studio gave the question: "33 outfits".
 *
 * The unit is the one studio word the app does inflect, because a quantity
 * cannot be said without it - and that decision was already made, in
 * sheet.ts's sayAnswer, which has always rendered "3 outfits" on a row. One
 * rule in two places would be two rules, so this follows that one exactly.
 */
export function sayTotal(total: number, unit: string | null) {
  return unit ? `${total} ${unit}${total === 1 ? '' : 's'}` : String(total);
}

const DAY = { weekday: 'long', day: 'numeric', month: 'long' } as const;
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { ...DAY, timeZone: 'UTC' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** A date said with the distance that makes it legible: "Saturday 26 September, in 4 days". */
export function sayDay(day: string, today: string): string {
  const d = daysBetween(today, day);
  const said = dayOf(`${day}T00:00:00Z`);
  if (d === 0) return `today, ${said}`;
  if (d === 1) return `tomorrow, ${said}`;
  if (d === -1) return `yesterday, ${said}`;
  return d > 0 ? `${said}, in ${plural(d, 'day')}` : `${said}, ${plural(-d, 'day')} ago`;
}

/** How long a job has sat where it is, as a clause: "waiting 29 days". */
export function sayAge(sinceIso: string, today: string): string {
  return plural(Math.max(0, daysBetween(sinceIso.slice(0, 10), today)), 'day');
}

/**
 * WHAT A JOB STILL NEEDS, as a clause - the reading that was four circles.
 * Absences first, in the order a job resolves them, then the fact that
 * explains the wait.
 */
export function sayNeeds(r: SheetBooking, today: string): Say {
  const p = r.planes;
  const gaps: string[] = [];
  if (!p.intake.client) gaps.push('no client recorded');
  if (!p.intake.package) gaps.push('no package recorded');
  if (!p.intake.date) gaps.push('no session date');
  if (p.intake.agreement === 'none' && r.stage?.kind !== 'booked') gaps.push('no proposal issued');
  const out: Say = [];

  if (gaps.length > 0) {
    const said = gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(', ')} and ${gaps[gaps.length - 1]}`;
    out.push(warm(`${said.charAt(0).toUpperCase()}${said.slice(1)}.`));
  }
  if (!p.intake.package) out.push(t('Nothing is committed and no work is defined.'));
  if (!p.intake.client) out.push(t('Identified by its package.'));

  // The date that passed without a decision, which is the likeliest loss on the book.
  if (p.intake.date && r.day && r.day < today && r.stage?.kind !== 'booked') {
    out.push(warm(`The session date passed ${sayAge(r.day, today)} ago,`), t(`on ${dayOf(`${r.day}T00:00:00Z`)}.`));
  }
  if (p.intake.agreement === 'proposed') {
    out.push(t(`Proposal issued ${sayAge(r.stageSince, today)} ago; awaiting a client response.`));
  }
  out.push(...sayUnanswered(p.forOpen));
  if (r.reminders) out.push(warm('Reminder due.'));
  if (gaps.length === 0 && out.length === 0) out.push(t('The record is complete.'));
  return out;
}

/** How long a job has been where it is, when that is the point: "In the book 43 days, and it has not moved." */
export function sayWait(r: SheetBooking, today: string, longest: boolean): Say {
  const age = sayAge(r.createdAt, today);
  return longest
    ? [t(`It entered the book ${age} ago and has not moved since —`), strong('the longest anything has waited.')]
    : [t(`It entered the book ${age} ago.`)];
}

/** A session, said: when it is, who is coming, and what the day still lacks. */
export function saySession(r: SheetBooking, crew: string[], today: string): Say {
  const p = r.planes;
  const out: Say = [];
  if (r.scheduledFor && r.day === today) out.push(strong(`Shoots at ${timeOf(r.scheduledFor)}.`));
  else if (r.day) out.push(strong(`Shoots ${sayDay(r.day, today)}.`));

  out.push(...sayPositions(r));

  if (crew.length > 0) out.push(t(`Personnel: ${crew.join(', ')}.`));
  else out.push(warm('No personnel assigned.'));

  // A date-kind answer is the occasion the session is for - a different date from the session.
  for (const f of p.axis.occasions) {
    const fact = r.facts.find((x) => x.label === f.label && x.day);
    if (fact?.day) out.push(t(`${f.label}: ${sayDay(fact.day, today)}.`));
  }
  out.push(...sayUnanswered(p.forOpen));
  return out;
}

/**
 * A CLASSIFICATION NOBODY HAS ANSWERED, asked in the studio's own words. A
 * dimension carries its question ("What occasion is it for?"), which is
 * better than anything the app could compose from its name; without one, the
 * name is said plainly and nothing is invented around it.
 */
export function sayUnanswered(open: { name: string; question: string | null }[]): Say {
  if (open.length === 0) return [];
  const asked = open.filter((d) => d.question);
  const bare = open.filter((d) => !d.question);
  const out: Say = [];
  if (asked.length > 0) out.push(warm(`Unanswered: ${asked.map((d) => d.question).join(' ')}`));
  if (bare.length > 0) out.push(warm(`${bare.map((d) => d.name).join(' and ')} not stated.`));
  return out;
}

/** Where each service of a job is, and who holds it - the reading that was a run of dots. */
export function sayPositions(r: SheetBooking): Say {
  const p = r.planes;
  const at = new Map<string, string[]>();
  for (const run of p.runs) {
    for (const svc of run.services) {
      const step = svc.steps.find((s) => s.state === 'current' || s.state === 'open');
      if (!step) continue;
      const key = `${step.name}||${step.who ?? ''}`;
      (at.get(key) ?? at.set(key, []).get(key)!).push(svc.name);
    }
  }
  if (at.size === 0) {
    if (!p.intake.package) return [];
    return p.runs.length === 0 ? [t('No steps are defined on it.')] : [t('Every step is done.')];
  }
  const out: Say = [];
  for (const [key, services] of at) {
    const [step, who] = key.split('||');
    const subject = services.length === 1 ? services[0] : `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`;
    const isAre = services.length === 1 ? 'is' : services.length === 2 ? 'are both' : 'are all';
    out.push(t(`${subject} ${isAre} on ${step},`));
    out.push(who ? t(`assigned to ${who}.`) : warm('unassigned.'));
  }
  return out;
}

/** A job in post-production: the session behind, the work still open. */
export function sayWork(r: SheetBooking, today: string): Say {
  const out: Say = [];
  if (r.day) out.push(strong(`Shot ${sayDay(r.day, today)}.`));
  out.push(...sayPositions(r));
  for (const f of r.facts) {
    if (f.kind === 'date' && f.day) out.push(t(`${f.label}: ${sayDay(f.day, today)}.`));
  }
  return out;
}

/** How far along a job's steps are - a numeral that carries its noun. */
export function sayProgress(r: SheetBooking): string | null {
  if (!r.work || r.work.total === 0) return null;
  return `${r.work.done} of ${plural(r.work.total, 'step')} done`;
}

/** Whether this job is finished and only the status says otherwise. */
export function sayReadyToClose(r: SheetBooking): Say {
  return [strong('Every step is done'), t('and the job is still open — only the status says otherwise.')];
}

/**
 * AN ABSENCE, COUNTED - the region's own totals, each a whole sentence so the
 * numeral is never read alone. Keyed by the app's own absence keys (sheet.ts
 * MISSING), which is the only vocabulary code may name.
 */
export function sayAbsence(key: string, n: number): Say {
  switch (key) {
    case 'lapsed': return [strong(plural(n, 'session date')), warm('passed with no decision recorded.')];
    case 'decision-studio': return [strong(plural(n, 'booking')), warm(`${is(n)} awaiting a studio decision:`), t('no proposal issued.')];
    case 'decision-client': return [strong(plural(n, 'booking')), t(`${is(n)} awaiting a client response to a proposal already issued.`)];
    case 'reminder': return [strong(plural(n, 'reminder')), warm(`${is(n)} due.`)];
    case 'client': return [strong(plural(n, 'booking')), t(`${has(n)} no client recorded, and ${n === 1 ? 'is' : 'are'} identified by package.`)];
    case 'date': return [strong(plural(n, 'booking')), t(`${has(n)} no session date and ${n === 1 ? 'does' : 'do'} not appear on the calendar.`)];
    case 'package': return [strong(plural(n, 'booking')), t(`${has(n)} no package recorded: nothing is committed and no work is defined.`)];
    case 'classification': return [strong(plural(n, 'booking')), t(`${has(n)} a classification the package leaves open and unanswered.`)];
    case 'crew': return [strong(plural(n, 'session')), t(`${is(n)} scheduled with`), warm('steps unassigned.')];
    default: return [strong(String(n))];
  }
}

/** The name a dated line leads with: the client if there is one, else the job's own title. */
const nameOf = (r: SheetBooking) => r.clientName ?? r.title;

/**
 * A CARD'S FOUR LINES (components/Board). A card is a fixed shape so a column
 * of them scans as a set, which means each line is short and each is the same
 * kind of fact on every card: who it is for, what it is, when it is, and the
 * ONE thing it most needs - the first absence in the order a job resolves
 * them, because a card that lists everything is a paragraph again.
 */
export function cardName(r: SheetBooking) {
  return r.clientName ?? r.title;
}

export function cardWhat(r: SheetBooking): string | null {
  if (r.packages.length > 0) return r.packages.join(' · ');
  // No package: the job's own title, unless the title is only the client's name again.
  return r.titleNamesClient || r.title === r.clientName ? null : r.title;
}

export function cardWhen(r: SheetBooking, today: string): string {
  if (!r.day) return 'no date yet';
  if (r.day === today) return r.scheduledFor ? `today at ${timeOf(r.scheduledFor)}` : 'today';
  return sayDay(r.day, today);
}

/** The one absence a card shows, in the order a job resolves them. */
export function cardNeeds(r: SheetBooking): string | null {
  const p = r.planes;
  if (!p.intake.client) return 'No client recorded';
  if (!p.intake.package) return 'No package recorded';
  if (r.day && r.stage?.kind !== 'booked' && r.reminders) return 'Reminder due';
  if (p.intake.agreement === 'none' && r.stage?.kind !== 'booked') return 'No proposal issued';
  if ((r.work?.unstaffed ?? 0) > 0) return `${plural(r.work!.unstaffed, 'step')} unassigned`;
  if (p.forOpen.length > 0) return `${p.forOpen[0].name} not stated`;
  if (p.intake.agreement === 'proposed') return 'Awaiting client response';
  return null;
}

/**
 * A SESSION ON ITS DAY, for the dated reading. The verb carries the tense, so
 * the line needs no column and no label to say what kind of date this is.
 */
export function sayDatedSession(r: SheetBooking, today: string): Say {
  const out: Say = [strong(nameOf(r))];
  const held = r.day! < today;
  // A date that passed on an undecided job was never a shoot: it is a date that went by.
  const undecided = held && r.stage?.kind !== 'booked';
  if (r.day === today && r.scheduledFor) out.push(t(`shoots at ${timeOf(r.scheduledFor)}.`));
  else if (undecided) out.push(warm('had this session date; it passed with no decision recorded.'));
  else if (held) out.push(t('was shot.'));
  else out.push(t('shoots.'));

  if (undecided) {
    // The one clause above says it; nothing follows a date that simply lapsed.
  } else if (held && r.work && r.work.done < r.work.total) {
    out.push(t(`Still in post-production, ${r.work.done} of ${plural(r.work.total, 'step')} done.`));
  } else if (!held && r.planes.runs.length > 0) {
    const open = r.work?.unstaffed ?? 0;
    if (open > 0) out.push(warm(`${plural(open, 'step')} unassigned.`));
  }
  return out;
}

/**
 * AN OCCASION ON ITS DAY - the date a job is *for*, which is not the date it
 * is shot. Said against the session when there is one, because the gap between
 * the two is the thing the operator reads.
 */
export function sayDatedOccasion(r: SheetBooking, label: string, day: string, today: string): Say {
  // A job with no client is named by the job, because a title does not take a possessive well.
  const out: Say = r.clientName
    ? [t(`${label} on`), strong(`${r.clientName}'s job.`)]
    : [t(`${label} on the job named`), strong(`${r.title}.`)];
  if (r.day) {
    const gap = daysBetween(r.day, day);
    out.push(t(gap === 0 ? 'The same day as the shoot.'
      : gap > 0 ? `${plural(gap, 'day')} after the shoot.`
      : `${plural(-gap, 'day')} before the shoot.`));
  } else {
    out.push(warm('No session date recorded.'));
  }
  return out;
}

/** The whole statement as one string - for titles, tests and anything that cannot draw parts. */
export const flat = (say: Say) => say.map((p) => p.t).join(' ');
