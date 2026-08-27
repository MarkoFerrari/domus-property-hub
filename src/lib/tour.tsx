/**
 * The product tour.
 *
 * WHY THIS EXISTS: a landlord who signs in for the first time sees a dashboard
 * full of numbers with no explanation of where they came from or what to do
 * about them. Seven spotlights, once, is cheaper than a help page nobody opens.
 *
 * WHAT IT IS NOT: a dependency. React Joyride and friends are forty kilobytes
 * and this app has five runtime dependencies on purpose. The whole thing is this
 * file plus `components/TourOverlay.tsx`, and it is designed to be deletable:
 * remove both files, drop `<TourProvider>` from main.tsx, and grep out
 * `data-tour` and `tourId`. Nothing else knows it existed.
 *
 * HOW IT SURVIVES NAVIGATION: the tour spans three routes, so its state cannot
 * live in a screen. This provider sits above <App/> and owns the step index; each
 * step declares the path it needs, and the provider navigates there before the
 * overlay looks for the element. The overlay waits for the target to mount and
 * SKIPS the step if it never does — a visitor stuck behind a dark overlay is far
 * worse than a missing step.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { calendarAvailable } from "./features";
import { useStore } from "./store";
import type { Property } from "./compliance";

/**
 * Where "they have already seen it" is remembered.
 *
 * The `domus.` prefix is load-bearing. `clearDemoData()` in demoMode.ts wipes
 * every key under that prefix when a demo starts, so EVERY fresh demo run
 * replays the tour. For a pitch that is the behaviour you want, not a bug to
 * fix later.
 *
 * KNOWN LIMIT: for a signed-in landlord this is per-browser, so the tour can
 * reappear on a second device. Moving it to a `profiles` column is a migration,
 * and a repeated tour is a far smaller problem than a missed one.
 */
const TOUR_KEY = "domus.tour.completed";

export function tourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    /* Safari private mode throws. Treat it as "seen" so the tour cannot loop on
       every dashboard visit for someone whose browser will never remember. */
    return true;
  }
}

function markCompleted(value: boolean) {
  try {
    if (value) localStorage.setItem(TOUR_KEY, "1");
    else localStorage.removeItem(TOUR_KEY);
  } catch {
    /* Nothing to store into. The tour still runs for this session. */
  }
}

/* ========================================================================== */
/* Steps                                                                       */
/* ========================================================================== */

export type TourStep = {
  id: string;
  /** The `data-tour` value to spotlight. */
  target: string;
  /** Where the app has to be for that element to exist. */
  path: string;
  title: string;
  body: string;
  /**
   * The same point in about half the words, for the phone sheet.
   *
   * Not an afterthought and not a truncation. The desktop card floats in empty
   * space beside the target and can afford a paragraph; the phone sheet is
   * docked over the navigation and every line it grows is a line of the actual
   * screen it hides. Six wrapped lines of explanation on a 390px screen covered
   * the bottom half of the thing being explained, which is the one thing a tour
   * must never do. Falls back to `body` if a step has none.
   */
  bodyShort?: string;
  /**
   * Which navigation section this step lives in.
   *
   * `key` matches a `data-tour-nav` attribute on the sidebar item (desktop) and
   * the bottom-nav item (mobile), so the overlay can light that item up as well
   * as the step's target. Without it the tour walks someone across three routes
   * and never says where any of them live, which is the one thing a first-run
   * tour is actually for.
   */
  nav: { key: string; label: string };
};

const NAV_DASHBOARD = { key: "dashboard", label: "Dashboard" } as const;
const NAV_PROPERTIES = { key: "properties", label: "Properties" } as const;

/**
 * Build the steps for this particular portfolio.
 *
 * The property steps need a real id, and the Calendar step needs a property that
 * actually has a Calendar tab, so the shape of the tour depends on what the
 * landlord owns. A short-term property is preferred for exactly that reason.
 */
function buildSteps(properties: Property[]): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "earnings",
      target: "earnings",
      path: "/dashboard",
      title: "Your earnings, as you record them",
      body: "Everything you confirm lands here. File a declaration or confirm a month's rent and it joins this total, split between your short-term and long-term properties.",
      bodyShort:
        "Everything you record lands here, split between your short-term and long-term properties.",
      nav: NAV_DASHBOARD,
    },
    {
      id: "actions",
      target: "actions",
      path: "/dashboard",
      title: "What needs you today",
      body: "Declarations coming due, rent still unconfirmed, certificates about to expire. Most urgent first. When this list is empty, you are done.",
      bodyShort:
        "Declarations due, rent unconfirmed, certificates expiring. Most urgent first. Empty means you are done.",
      nav: NAV_DASHBOARD,
    },
  ];

  const subject = properties.find((p) => p.type === "short") ?? properties[0];
  if (!subject) return steps;

  const isShort = subject.type === "short";
  const base = `/properties/${subject.id}`;

  steps.push(
    {
      id: "property-card",
      target: "property-card",
      path: "/properties",
      title: "One card per property",
      body: "The badge tells you whether anything is outstanding before you open it, so you can scan the whole portfolio in a glance.",
      bodyShort: "The badge tells you whether anything is outstanding, before you open it.",
      nav: NAV_PROPERTIES,
    },
    {
      id: "tab-overview",
      target: "tab-overview",
      path: `${base}?tab=overview`,
      title: "Overview",
      body: "This property at a glance: the income recorded against it this year, and the six certificates Domus watches, each with the date it expires.",
      bodyShort:
        "Income recorded against this property this year, and the six certificates Domus watches.",
      nav: NAV_PROPERTIES,
    },
    {
      id: "tab-payments",
      target: "tab-payments",
      path: `${base}?tab=payments`,
      title: isShort ? "Declarations" : "Rent",
      body: isShort
        ? "Every completed month, and whether you have recorded it yet. Short-term properties carry two obligations a month, the stay declaration and ΤΑΚΚ, each with its own deadline."
        : "Every completed month, and whether the rent actually arrived. One confirmation a month, with the date it landed and room for a note.",
      bodyShort: isShort
        ? "Every completed month, and whether you have recorded it. Short-term months carry two obligations."
        : "Every completed month, and whether the rent arrived. One confirmation each.",
      nav: NAV_PROPERTIES,
    },
    {
      id: "record-button",
      target: "record-button",
      path: `${base}?tab=payments`,
      title: isShort ? "Recording a month" : "Confirming a month",
      body: isShort
        ? "This opens one dialog covering both of that month's obligations. Enter what each one came to, or tick nothing to declare if the month earned nothing — a blank month still has to be filed. Once both are in, the month turns green and drops out of your action queue."
        : "This opens one dialog for the month: the amount that arrived, the date it landed, and a note if something was unusual. Domus never touches your bank, it records what you tell it. Confirming clears the month from your action queue.",
      bodyShort: isShort
        ? "One dialog covers both obligations. A month that earned nothing still has to be filed."
        : "One dialog: the amount, the date it landed, an optional note. Domus never touches your bank.",
      nav: NAV_PROPERTIES,
    },
  );

  /* Only if the tab exists. Sending the tour to ?tab=calendar on a property with
     no Calendar tab lands on Overview, and the spotlight would hunt for two and a
     half seconds for an element that is never coming. */
  if (calendarAvailable(isShort)) {
    steps.push({
      id: "tab-calendar",
      target: "tab-calendar",
      path: `${base}?tab=calendar`,
      title: "Calendar",
      body: "Connect your Airbnb or Booking.com calendar and Domus counts booked nights next to your declarations. The nights shown here are a preview, not your real bookings.",
      bodyShort:
        "Connect Airbnb or Booking.com and booked nights sit next to your declarations. These are a preview.",
      nav: NAV_PROPERTIES,
    });
  }

  return steps;
}

/* ========================================================================== */
/* Provider                                                                    */
/* ========================================================================== */

type TourValue = {
  active: boolean;
  step: TourStep | null;
  index: number;
  total: number;
  next: () => void;
  back: () => void;
  end: () => void;
  /** Clears the "seen it" flag and runs the tour again from the top. */
  restart: () => void;
};

const Ctx = createContext<TourValue | null>(null);

export function useTour(): TourValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTour must be used inside <TourProvider>");
  return v;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { loading, properties } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  const steps = useMemo(() => buildSteps(properties), [properties]);
  const step = active ? (steps[index] ?? null) : null;

  const end = useCallback(() => {
    setActive(false);
    setIndex(0);
    markCompleted(true);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        setActive(false);
        markCompleted(true);
        return 0;
      }
      return i + 1;
    });
  }, [steps.length]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /**
   * Clear any toasts, then open.
   *
   * Sonner renders above everything the app itself draws, and on a phone its
   * toasts sit along the bottom edge — exactly where the bottom navigation is,
   * which is the thing the tour lights up to say where you are. The tour opens
   * seconds after "5 example properties added" fires, so without this the very
   * first screen of the very first run has a toast sitting in the spotlight.
   */
  const beginTour = useCallback(() => {
    toast.dismiss();
    setActive(true);
  }, []);

  const restart = useCallback(() => {
    markCompleted(false);
    setIndex(0);
    beginTour();
    navigate("/dashboard");
  }, [beginTour, navigate]);

  /**
   * Auto-start, once, on the dashboard.
   *
   * The `properties.length > 0` gate matters more than it looks. A landlord who
   * has just signed up sees an empty-state dashboard, and spotlighting an empty
   * Earnings card to explain how earnings work teaches nothing and reads as
   * broken. They get the tour after their first property exists.
   */
  useEffect(() => {
    if (active || loading) return;
    if (location.pathname !== "/dashboard") return;
    if (properties.length === 0) return;
    if (tourCompleted()) return;

    /* Let the dashboard finish painting. Spotlighting a card that is still a
       skeleton measures the wrong rectangle. */
    const t = window.setTimeout(beginTour, 600);
    return () => window.clearTimeout(t);
  }, [active, beginTour, loading, location.pathname, properties.length]);

  /** Keep the app on the route the current step needs. */
  useEffect(() => {
    if (!step) return;
    const here = `${location.pathname}${location.search}`;
    if (here !== step.path) navigate(step.path);
  }, [step, location.pathname, location.search, navigate]);

  const value = useMemo<TourValue>(
    () => ({ active, step, index, total: steps.length, next, back, end, restart }),
    [active, step, index, steps.length, next, back, end, restart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
