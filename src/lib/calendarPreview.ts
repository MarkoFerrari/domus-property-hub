/**
 * The calendar connection, simulated.
 *
 * WHY THIS EXISTS: D1 in the handoff doc asks for an Airbnb/Booking.com calendar
 * on the property screen. A real connection means fetching a secret `.ics` URL,
 * which a browser cannot do (CORS) and a public bundle must not hold. That is an
 * edge function, a table, a cron and a parser. For the MVP we are shipping the
 * screen and the story, not the plumbing.
 *
 * SO EVERY NIGHT IN HERE IS INVENTED. Nothing in this file talks to Airbnb or
 * Booking.com and nothing ever will. It exists to make the shape of the feature
 * real enough to look at, click through and demo.
 *
 * THE ONE RULE THAT MATTERS: the numbers must be stable. A landlord who sees 14
 * nights on the calendar and 11 in the record dialog has been shown a bug, not a
 * preview. So the generator is seeded from the property id, the channel and the
 * month, and returns the same answer every time for the same three inputs. No
 * Math.random anywhere. Reload, navigate away, come back: identical.
 *
 * DELIBERATE DESIGN CHOICE: stays are stored `{ start, end }` with **end
 * exclusive**, matching the iCal `DTEND` convention. A stay of 10 -> 12 is two
 * nights, because the guest checks out on the 12th and does not sleep there.
 * Real feeds work this way, so when the simulation is swapped for a real one the
 * UI contract does not move. That off-by-one is the single most common bug in
 * calendar integrations and it is worth being right about even in a fake.
 *
 * The disclaimers that must appear alongside anything from this file live in
 * `legal.ts` as CALENDAR_SIMULATED_SHORT / _LONG / CALENDAR_PREFILL_NOTE.
 */

export type Channel = "airbnb" | "booking";

export const CHANNELS: readonly Channel[] = ["airbnb", "booking"] as const;

export const CHANNEL_LABEL: Record<Channel, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
};

export function isChannel(v: unknown): v is Channel {
  return v === "airbnb" || v === "booking";
}

/** A booked stay, as day-of-month numbers. `end` is EXCLUSIVE (checkout day). */
export type Stay = { start: number; end: number };

export type MonthNights = {
  /** Nights actually slept, across the whole month. */
  nights: number;
  /** How many days the month has, for the "14 of 31" line. */
  daysInMonth: number;
  stays: Stay[];
  /** Day numbers that count as a booked night. Checkout days are NOT in here. */
  bookedDays: Set<number>;
};

/* -------------------------------------------------------------------------- */
/* Seeded randomness                                                          */
/* -------------------------------------------------------------------------- */

/** FNV-1a. Small, stable, and does not need a dependency. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny deterministic PRNG. Same seed, same sequence, forever. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* Seasonality                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Roughly how full a Greek short-term let runs, by month index (0 = January).
 *
 * These are shaped to look like the Greek season rather than measured from
 * anything: dead in winter, climbing through spring, near-full in August, a long
 * tail through October. A flat 50% every month would read as obviously fake the
 * moment anyone clicked through two months, which defeats the point of building
 * a preview at all.
 */
const OCCUPANCY = [0.24, 0.27, 0.34, 0.46, 0.61, 0.76, 0.88, 0.93, 0.79, 0.56, 0.29, 0.36];

/** Booking.com tends to run a little behind Airbnb for small Greek hosts. */
const CHANNEL_WEIGHT: Record<Channel, number> = { airbnb: 1, booking: 0.82 };

export function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/* -------------------------------------------------------------------------- */
/* The generator                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Invented but stable bookings for one property, one channel, one month.
 *
 * Stays never overlap and always leave at least one free night between them, so
 * the grid reads like a real calendar rather than a solid block of colour.
 */
export function simulatedMonth(
  propertyId: string,
  channel: Channel,
  year: number,
  monthIdx: number,
): MonthNights {
  const total = daysInMonth(year, monthIdx);
  const rnd = seeded(hashString(`${propertyId}|${channel}|${year}-${monthIdx}`));

  /* Jitter the seasonal baseline so two properties in the same month differ. */
  const target = Math.round(total * OCCUPANCY[monthIdx] * CHANNEL_WEIGHT[channel] * (0.82 + rnd() * 0.36));

  const stays: Stay[] = [];
  const bookedDays = new Set<number>();
  let nights = 0;
  let cursor = 1 + Math.floor(rnd() * 4);

  while (cursor <= total && nights < target) {
    /* 2 to 7 nights: a weekend break through to a full week. */
    const length = 2 + Math.floor(rnd() * 6);
    const end = Math.min(cursor + length, total + 1);
    const staked = end - cursor;
    if (staked < 1) break;

    stays.push({ start: cursor, end });
    for (let d = cursor; d < end; d += 1) bookedDays.add(d);
    nights += staked;

    /* Turnaround before the next guest. Tighter in peak season, because that is
       what actually happens: in August a gap of four nights is lost money and a
       host fills it, in February nobody is asking. Without this the forced gaps
       cap every month at roughly the same occupancy and August ends up looking
       like March, which is exactly the tell that makes sample data read as
       fake. */
    const peak = OCCUPANCY[monthIdx] > 0.7;
    cursor = end + 1 + Math.floor(rnd() * (peak ? 2 : 4));
  }

  return { nights, daysInMonth: total, stays, bookedDays };
}

/* -------------------------------------------------------------------------- */
/* Which properties are "connected"                                           */
/* -------------------------------------------------------------------------- */

/**
 * Connections live in localStorage, NOT in Supabase, on purpose.
 *
 * There is no migration for this and there should not be one: a fake connection
 * is not portfolio data and does not belong in a table a landlord could later
 * mistake for a record of something real. It also means the preview behaves
 * identically in demo mode and connected mode with no branching.
 *
 * The `domus.` prefix matters: demo mode clears by that prefix on exit, so a
 * demo visitor's connections disappear with the rest of their visit.
 */
const STORE_KEY = "domus.calendar.connections";

export type Connection = { channel: Channel; connectedAt: string };

type ConnectionMap = Record<string, Connection>;

function readAll(): ConnectionMap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ConnectionMap;
  } catch {
    /* A corrupt value must not take the property screen down with it. */
    return {};
  }
}

function writeAll(map: ConnectionMap): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* Private browsing, quota, disabled storage. The screen still works, the
       connection just does not survive a reload. Not worth an error banner. */
  }
}

export function getConnection(propertyId: string | undefined): Connection | null {
  if (!propertyId) return null;
  const found = readAll()[propertyId];
  return found && isChannel(found.channel) ? found : null;
}

export function connect(propertyId: string, channel: Channel): Connection {
  const map = readAll();
  const record: Connection = { channel, connectedAt: new Date().toISOString() };
  map[propertyId] = record;
  writeAll(map);
  return record;
}

export function disconnect(propertyId: string): void {
  const map = readAll();
  delete map[propertyId];
  writeAll(map);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** "14 of 31 nights booked". Kept here so the tab and the dialog cannot drift. */
export function nightsSummary(m: MonthNights): string {
  return `${m.nights} of ${m.daysInMonth} nights booked`;
}
