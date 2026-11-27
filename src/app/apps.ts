import {
  LayoutGrid, ShoppingBag, Tag, Send, Images, Wallet,
  CalendarPlus, CalendarDays, Users, Contact, Package as PackageIcon,
} from 'lucide-react';

/**
 * What this studio runs on — one list, read by the sidebar and by the home
 * page both.
 *
 * The previous system kept two copies and they drifted in the quietest way
 * possible: the sidebar grew Galleries and Deliverables, the grid did not,
 * and an operator navigating from home never learned those screens existed.
 * Its own comment recorded the lesson — "a missing tile looks exactly like a
 * complete grid". Nothing announces an omission, so the only safe number of
 * copies is one.
 */
export type Where =
  | 'home' | 'dashboard' | 'calendar' | 'bookings' | 'clients' | 'deliverables'
  | 'packages' | 'team' | 'orders' | 'payments'
  | 'store' | 'automations' | 'galleries';

export type AppKey = Exclude<Where, 'home'>;

export type App = {
  key: AppKey;
  href: string;
  label: string;
  /** What it is for, said when there is nothing yet to report. */
  what: string;
  Icon: typeof LayoutGrid;
};

/*
 * The sidebar. NOT every screen in the studio — `/store` prices what is sold
 * and is reached from Deliverables, because a second top-level entry called
 * "Products" sitting beside "Deliverables" asked a studio to know the
 * difference between two words for the same objects.
 */
export const APPS: App[] = [
  {
    key: 'dashboard', href: '/dashboard', label: 'Dashboard', Icon: LayoutGrid,
    what: 'Schedule and outstanding items',
  },
  {
    key: 'calendar', href: '/calendar', label: 'Calendar', Icon: CalendarDays,
    what: 'Every date the studio is committed to',
  },
  {
    key: 'bookings', href: '/bookings', label: 'Bookings', Icon: CalendarPlus,
    what: 'Requests from outside the studio',
  },
  {
    key: 'payments', href: '/payments', label: 'Payments', Icon: Wallet,
    what: 'Booking invoices and balances',
  },
  {
    key: 'clients', href: '/clients', label: 'Clients', Icon: Contact,
    what: 'Who the studio serves',
  },
  {
    key: 'deliverables', href: '/deliverables', label: 'Deliverables', Icon: Tag,
    what: 'What you hand over',
  },
  {
    key: 'packages', href: '/packages', label: 'Packages', Icon: PackageIcon,
    what: 'What a client can book',
  },
  {
    key: 'team', href: '/team', label: 'Team', Icon: Users,
    what: 'Who works here',
  },
  {
    key: 'galleries', href: '/galleries', label: 'Galleries', Icon: Images,
    what: 'Finished work, handed over',
  },
  {
    key: 'orders', href: '/orders', label: 'Orders', Icon: ShoppingBag,
    what: 'Prints a client has bought',
  },
  {
    key: 'automations', href: '/automations', label: 'Follow-ups', Icon: Send,
    what: 'Messages owed after a booking',
  },
];

/** What each screen can be counted for, gathered once by the home page. */
export type Standing = {
  /*
   * What is somebody's move, from the dashboard's own readings — so the tile
   * and the page it opens can never disagree. Not derived from `bookings.turn`,
   * which is a column a human sets.
   */
  outstanding: number | null;
  requestsWaiting: number | null;
  /* Shoots in the next seven days. Not every engagement: what a tile is for
   * is the work, and a code expiring is not somewhere anybody has to be. */
  nextSevenDays: number;
  /* Split the way the engine splits them: files are handed over, objects
   * have to be made and posted by somebody. */
  deliverables: { files: number; objects: number };
  packages: { all: number; published: number };
  team: number;
  /* People a booking points at. Not everybody in `people`: a gallery visitor
   * is a person row too, and is not a client. */
  clients: number;
  galleries: { all: number; shared: number };
  ordersNeedingAttention: number;
  picturesForSale: number;
  messagesDue: number;
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What a tile says.
 *
 * The reading when there is one, and what the screen is FOR when there is
 * not. A studio that signed up ten minutes ago learns what Board means; a
 * studio with work on learns how much — and neither is shown a label beside
 * a number, which is the thing a reading must never need.
 */
export function sayApp(app: App, standing: Standing): string {
  switch (app.key) {
    case 'dashboard':
      return !standing.outstanding
        ? app.what
        : count(standing.outstanding, 'item outstanding', 'items outstanding');

    case 'bookings':
      return !standing.requestsWaiting
        ? app.what
        : `${count(standing.requestsWaiting, 'request', 'requests')} awaiting a response`;

    case 'payments':
      return app.what;

    case 'deliverables': {
      const { files, objects } = standing.deliverables;
      if (files + objects === 0) return app.what;
      if (objects === 0) return count(files, 'file', 'files');
      if (files === 0) return `${count(objects, 'object', 'objects')} to make`;
      return `${count(files, 'file', 'files')}, ${objects} to make`;
    }

    case 'packages': {
      const { all, published } = standing.packages;
      if (all === 0) return app.what;
      if (published === 0) return `${count(all, 'package', 'packages')}, none published`;
      return `${published} of ${all} published`;
    }

    case 'team':
      return standing.team === 0
        ? app.what
        : count(standing.team, 'person', 'people');

    case 'calendar':
      return standing.nextSevenDays === 0
        ? app.what
        : `${count(standing.nextSevenDays, 'shoot', 'shoots')} in the next seven days`;

    case 'clients':
      return standing.clients === 0
        ? app.what
        : count(standing.clients, 'client', 'clients');

    case 'galleries': {
      const { all, shared } = standing.galleries;
      if (all === 0) return app.what;
      if (shared === 0) return `${count(all, 'gallery', 'galleries')}, none shared`;
      return `${shared} of ${all} shared`;
    }

    case 'orders':
      return standing.ordersNeedingAttention === 0
        ? app.what
        : `${count(standing.ordersNeedingAttention, 'order', 'orders')} needing attention`;

    case 'store':
      return standing.picturesForSale === 0
        ? app.what
        : `${count(standing.picturesForSale, 'picture', 'pictures')} a client can buy`;

    case 'automations':
      return standing.messagesDue === 0
        ? app.what
        : `${count(standing.messagesDue, 'message', 'messages')} due`;
  }
}
