/**
 * The spotlight and the tooltip for the product tour.
 *
 * The steps and the navigation between them live in `src/lib/tour.tsx`. This
 * file is only concerned with finding the target element, cutting holes in a
 * dark backdrop around it, and putting a readable card next to it.
 *
 * TWO HOLES, NOT ONE. Every step lights up its target AND the navigation item
 * for the section that target lives in — the sidebar row on desktop, the bottom
 * bar item on a phone. A tour that walks someone across three routes without
 * ever saying where those routes live teaches them the screens and not the app.
 * That is what forces the SVG mask below: `box-shadow: 0 0 0 9999px` can only
 * ever produce ONE hole, because a second element's shadow paints over the
 * first's.
 *
 * THE ONE RULE: never trap the visitor. If the target element does not appear
 * within `FIND_TIMEOUT_MS` the step is skipped rather than waited on, Escape
 * ends the tour from anywhere, clicking the backdrop ends it, and the Skip
 * control is on every step. An overlay with no way out is worse than no overlay.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useTour } from "../lib/tour";

/** How long to wait for a step's target to mount before giving up on it. */
const FIND_TIMEOUT_MS = 2500;

/** Breathing room between a spotlight ring and the element it surrounds. */
const SPOTLIGHT_PAD = 8;
const NAV_PAD = 4;

const TIP_WIDTH = 340;
const TIP_GAP = 14;
const EDGE = 16;

/** Below this the tooltip stops floating and becomes a bottom sheet. */
const SHEET_BREAKPOINT = 640;

const DIM = "rgba(13, 13, 13, 0.55)";
const ACCENT = "#FF6B35";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Box = { top: number; left: number; width: number; height: number };

const toBox = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/**
 * The first match that is actually on screen.
 *
 * Several tour targets are rendered twice — the Declarations rows exist as a
 * stacked list for phones and a table for desktop, the navigation as a sidebar
 * and a bottom bar — with one hidden by a breakpoint. `querySelector` would
 * happily return the hidden one, whose rectangle is zero by zero, and the
 * spotlight would be a dot in the top-left corner.
 */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function TourOverlay() {
  const { active, step, index, total, next, back, end } = useTour();

  const [box, setBox] = useState<Box | null>(null);
  const [navBox, setNavBox] = useState<Box | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipHeight, setTipHeight] = useState(200);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < SHEET_BREAKPOINT,
  );

  const reduced = prefersReducedMotion();
  const targetSelector = step ? `[data-tour="${step.target}"]` : null;
  const navSelector = step ? `[data-tour-nav="${step.nav.key}"]` : null;

  /* ---------------------------------------------------------------------- */
  /* Find and measure                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!targetSelector) {
      setBox(null);
      setNavBox(null);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let settle = 0;
    const startedAt = Date.now();

    const tick = () => {
      if (cancelled) return;
      const el = findVisible(targetSelector);

      if (el) {
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: reduced ? "auto" : "smooth",
        });
        /* Measure AFTER the scroll lands, or the rectangle belongs to where the
           element used to be and the spotlight sits somewhere else entirely. */
        settle = window.setTimeout(
          () => {
            if (cancelled) return;
            setBox(toBox(el));
            const nav = navSelector ? findVisible(navSelector) : null;
            setNavBox(nav ? toBox(nav) : null);
          },
          reduced ? 0 : 340,
        );
        return;
      }

      if (Date.now() - startedAt > FIND_TIMEOUT_MS) {
        /* The route may have changed under us, or this screen simply does not
           have the element. Move on rather than holding the visitor hostage. */
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    setBox(null);
    setNavBox(null);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [targetSelector, navSelector, reduced, next]);

  /* Keep the holes over their elements when the page moves under them. */
  useEffect(() => {
    if (!targetSelector) return;
    const remeasure = () => {
      const el = findVisible(targetSelector);
      if (el) setBox(toBox(el));
      const nav = navSelector ? findVisible(navSelector) : null;
      setNavBox(nav ? toBox(nav) : null);
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [targetSelector, navSelector]);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < SHEET_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (tipRef.current) setTipHeight(tipRef.current.offsetHeight);
  }, [step, isNarrow, box]);

  /* Move focus onto the card for every step, so a keyboard or screen-reader
     user is reading the same thing the spotlight is pointing at. */
  useEffect(() => {
    if (step && box && tipRef.current) tipRef.current.focus();
  }, [step, box]);

  /* ---------------------------------------------------------------------- */
  /* Keyboard                                                               */
  /* ---------------------------------------------------------------------- */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        end();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
        return;
      }
      if (e.key !== "Tab") return;

      /* Trap. The app behind the backdrop is not operable during the tour, so
         tabbing into it would leave focus somewhere the visitor cannot see. */
      const focusables = tipRef.current?.querySelectorAll<HTMLElement>("button");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [back, end, next],
  );

  if (!active || !step || !box) return null;

  /* ---------------------------------------------------------------------- */
  /* Placement                                                              */
  /* ---------------------------------------------------------------------- */

  const vh = window.innerHeight;
  const vw = window.innerWidth;

  let tipStyle: React.CSSProperties;
  if (isNarrow) {
    /* A floating card next to a card taller than the phone screen is unreadable.
       Pin it to the bottom instead, where a thumb already is — but ABOVE the
       bottom navigation, because on a phone that bar is the "you are here"
       indicator and a sheet sitting on top of it hides the very thing this step
       is trying to point out. */
    const navLift = navBox ? vh - navBox.top + TIP_GAP - NAV_PAD : EDGE / 2;
    tipStyle = { left: EDGE / 2, right: EDGE / 2, bottom: navLift, width: "auto" };
  } else {
    /* Four placements, tried in order, because the thing being explained must
       stay visible. Domus's dashboard cards are most of a viewport tall, so
       "below, else above" alone puts the tooltip straight on top of the card it
       is pointing at — which is the one outcome that makes a tour pointless.
       Beside is the placement that actually works for a tall target. */
    const outerTop = box.top - SPOTLIGHT_PAD;
    const outerBottom = box.top + box.height + SPOTLIGHT_PAD;
    const outerLeft = box.left - SPOTLIGHT_PAD;
    const outerRight = box.left + box.width + SPOTLIGHT_PAD;

    const roomBelow = vh - outerBottom - TIP_GAP - EDGE;
    const roomAbove = outerTop - TIP_GAP - EDGE;
    const roomRight = vw - outerRight - TIP_GAP - EDGE;
    const roomLeft = outerLeft - TIP_GAP - EDGE;

    /** Beside the target, level with it, without running off the top or bottom. */
    const besideTop = Math.min(
      Math.max(EDGE, box.top + box.height / 2 - tipHeight / 2),
      Math.max(EDGE, vh - tipHeight - EDGE),
    );

    if (roomBelow >= tipHeight) {
      tipStyle = {
        top: outerBottom + TIP_GAP,
        left: Math.min(Math.max(EDGE, box.left), vw - TIP_WIDTH - EDGE),
        width: TIP_WIDTH,
      };
    } else if (roomAbove >= tipHeight) {
      tipStyle = {
        top: outerTop - TIP_GAP - tipHeight,
        left: Math.min(Math.max(EDGE, box.left), vw - TIP_WIDTH - EDGE),
        width: TIP_WIDTH,
      };
    } else if (roomRight >= TIP_WIDTH) {
      tipStyle = { top: besideTop, left: outerRight + TIP_GAP, width: TIP_WIDTH };
    } else if (roomLeft >= TIP_WIDTH) {
      tipStyle = { top: besideTop, left: outerLeft - TIP_GAP - TIP_WIDTH, width: TIP_WIDTH };
    } else {
      /* Nothing fits anywhere: a target nearly as big as the viewport. Drop to
         the same bottom sheet the phone layout uses, which at least never sits
         over the top of the target where the heading is. */
      tipStyle = { left: EDGE, right: EDGE, bottom: EDGE, width: "auto" };
    }
  }

  const isLast = index === total - 1;
  const titleId = `tour-title-${step.id}`;
  const bodyId = `tour-body-${step.id}`;
  const ease = reduced
    ? "none"
    : "top .22s ease, left .22s ease, width .22s ease, height .22s ease";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000000000 }}>
      {/* Catches clicks so the app underneath is inert, and gives "click away to
          dismiss" somewhere to happen. Sits below the mask, which is inert. */}
      <div style={{ position: "absolute", inset: 0 }} onClick={end} aria-hidden="true" />

      {/* The dim, with a hole punched for the target and another for the nav
          item. A mask rather than a box-shadow because one shadow cannot make
          two holes. */}
      <svg
        aria-hidden="true"
        width={vw}
        height={vh}
        style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <mask id="domus-tour-mask">
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            <rect
              x={box.left - SPOTLIGHT_PAD}
              y={box.top - SPOTLIGHT_PAD}
              width={box.width + SPOTLIGHT_PAD * 2}
              height={box.height + SPOTLIGHT_PAD * 2}
              rx={16}
              fill="#000"
            />
            {navBox ? (
              <rect
                x={navBox.left - NAV_PAD}
                y={navBox.top - NAV_PAD}
                width={navBox.width + NAV_PAD * 2}
                height={navBox.height + NAV_PAD * 2}
                rx={10}
                fill="#000"
              />
            ) : null}
          </mask>
        </defs>
        <rect x={0} y={0} width={vw} height={vh} fill={DIM} mask="url(#domus-tour-mask)" />
      </svg>

      {/* Target ring — solid accent, the thing being explained. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: box.top - SPOTLIGHT_PAD,
          left: box.left - SPOTLIGHT_PAD,
          width: box.width + SPOTLIGHT_PAD * 2,
          height: box.height + SPOTLIGHT_PAD * 2,
          borderRadius: 16,
          border: `2px solid ${ACCENT}`,
          pointerEvents: "none",
          transition: ease,
        }}
      />

      {/* Nav ring — white, and deliberately quieter than the target ring. Two
          equally loud highlights would just read as two targets. */}
      {navBox ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: navBox.top - NAV_PAD,
            left: navBox.left - NAV_PAD,
            width: navBox.width + NAV_PAD * 2,
            height: navBox.height + NAV_PAD * 2,
            borderRadius: 10,
            border: "1.5px solid rgba(255,255,255,0.75)",
            pointerEvents: "none",
            transition: ease,
          }}
        />
      ) : null}

      <div
        ref={tipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          position: "fixed",
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 20px 48px -12px rgba(13, 13, 13, 0.35)",
          outline: "none",
          ...tipStyle,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#9ca3af",
              textTransform: "uppercase",
            }}
          >
            Step {index + 1} of {total}
          </span>

          {/* Says the section in words, next to a nav item lit up in the same
              moment. The words alone would be a label; the highlight alone would
              be a glow someone has to interpret. Together they are an answer. */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#9a3412",
              backgroundColor: "#fff4ee",
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            You are in {step.nav.label}
          </span>
        </div>

        <h2 id={titleId} style={{ marginTop: 10, fontWeight: 700, fontSize: 17, color: "#111827" }}>
          {step.title}
        </h2>

        <p id={bodyId} style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: "#6b7280" }}>
          {step.body}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={end}
            className="tap-44"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "#6b7280",
              cursor: "pointer",
            }}
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={back}
                className="tap-44"
                style={{
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  border: "1.5px solid #E8E8E8",
                  color: "#0D0D0D",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="tap-44"
              style={{
                height: 38,
                padding: "0 18px",
                borderRadius: 8,
                backgroundColor: "#0D0D0D",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
