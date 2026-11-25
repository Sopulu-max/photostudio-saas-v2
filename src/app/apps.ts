import {
  LayoutGrid, ShoppingBag, Tag, Send, Images, Smartphone,
  CalendarPlus, CalendarDays, Users, Package as PackageIcon,
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
  | 'home' | 'dashboard' | 'calendar' | 'bookings' | 'packages' | 'team' | 'orders'
  | 'store' | 'automations' | 'galleries' | 'mobile';

export type AppKey = Exclude<Where, 'home'>;

export type App = {
  key: AppKey;
  href: string;
  label: string;
  /** What it is for, said when there is nothing yet to report. */
  what: string;
  Icon: typeof LayoutGrid;
};

export const APPS: App[] = [
  {
    key: 'dashboard', href: '/dashboard', label: 'Dashboard', Icon: LayoutGrid,
    what: 'What is outstanding, and today',
  },
  {
    key: 'mobile', href: '/mobile', label: 'Today', Icon: Smartphone,
    what: 'The day, on a phone',
  },
  {
    key: 'calendar', href: '/calendar', label: 'Calendar', Icon: CalendarDays,
    what: 'Shoots by the month',
  },
  {
    key: 'bookings', href: '/bookings', label: 'Bookings', Icon: CalendarPlus,
    what: 'Requests from outside the studio',
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
    key: 'store', href: '/store', label: 'Products', Icon: Tag,
    what: 'What a gallery can sell',
  },
  {
    key: 'automations', href: '/automations', label: 'Follow-ups', Icon: Send,
    what: 'Messages owed after a job',
  },
];

/** What each screen can be counted for, gathered once by the home page. */
export type Standing = {
  /*
   * What is somebody's move, from the dashboard's own readings — so the tile
   * and the page it opens can never disagree. Not derived from `jobs.turn`,
   * which is a column a human sets.
   */
  outstanding: number;
  onToday: number;
  nextSevenDays: number;
  requestsWaiting: number;
  packages: { all: number; published: number };
  team: number;
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
      return standing.outstanding === 0
        ? app.what
        : count(standing.outstanding, 'item outstanding', 'items outstanding');

    case 'mobile':
      return standing.onToday === 0
        ? app.what
        : `${count(standing.onToday, 'shoot', 'shoots')} today`;

    case 'calendar':
      return standing.nextSevenDays === 0
        ? app.what
        : `${count(standing.nextSevenDays, 'shoot', 'shoots')} in the next seven days`;

    case 'bookings':
      return standing.requestsWaiting === 0
        ? app.what
        : `${count(standing.requestsWaiting, 'request', 'requests')} awaiting a response`;

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
