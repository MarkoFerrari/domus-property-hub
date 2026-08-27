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
 *
 * TWO LAYOUTS, ONE COMPONENT. Above `SHEET_BREAKPOINT` the card floats beside
 * the thing it explains and the page is scrolled so the target sits in the
 * middle of the viewport. Below it, the card is a sheet docked over the bottom
 * navigation, and the viewport is no longer the space available — the sheet
 * eats the bottom third of it. Everything under "Phone layout" below exists
 * because of that one difference. Nothing there runs on desktop.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useTour } from "../lib/tour";

/** How long to wait for a step's target to mount before giving up on it. */
const FIND_TIMEOUT_MS = 2500;

/** Breathing room between a spotlight ring and the element it surrounds. */
const SPOTLIGHT_PAD = 8;
const NAV_PAD = 4;
/** Zero on a phone: the sheet is flush on the bar, so a ring above the nav
    item's own top edge would be hidden under the sheet anyway. */
const NAV_PAD_NARROW = 0;

const TIP_WIDTH = 340;
const TIP_GAP = 14;
const EDGE = 16;

/* ------------------------------------------------------------------------ */
/* Phone layout constants                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Below this the tooltip stops floating and becomes a bottom sheet.
 *
 * This is `lg` in Tailwind's default scale, and it is the same number AppShell
 * uses to swap its 240px sidebar for the bottom bar. The two have to agree: the
 * sheet is positioned off the bottom navigation's own rectangle, so a width
 * where the sheet logic is running and the bottom bar is not (or the reverse)
 * puts the card in the wrong place. It was 640 before, which left tablets at
 * 700–1000px running the desktop card over a mobile layout, free to land on top
 * of the bottom bar the step was pointing at.
 */
const SHEET_BREAKPOINT = 1024;

/** The sheet goes edge to edge on a phone, but a 900px-wide line is unreadable. */
const SHEET_MAX_WIDTH = 560;

/**
 * The sheet sits flush on top of the bottom navigation.
 *
 * A gap here leaves an 8px sliver of dimmed app between the sheet and the bar,
 * which reads as a rendering seam rather than as breathing room. Flush also
 * means the lit nav item needs no padding around it (see NAV_PAD_NARROW) — the
 * hole in the dim is doing that work already.
 */
const SHEET_LIFT = 0;

/** The sticky topbar in AppShell. The area behind it is not free space. */
const TOPBAR_H = 60;

/** Breathing room at the top and bottom of the space left over for the target. */
const FREE_MARGIN = 12;

/** Height to assume for the sheet before it has ever been measured. */
const DEFAULT_SHEET_H = 200;

/** Tighter than desktop: on a phone the target is usually near the full width. */
const SPOTLIGHT_PAD_NARROW = 6;

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

/** How much of the bottom of the screen the navigation bar owns. */
function bottomNavHeight(): number {
  const nav = findVisible("[data-tour-nav]");
  if (!nav) return 0;
  const r = nav.getBoundingClientRect();
  /* The sidebar carries the same attribute. It is tall and starts at the top of
     the screen; the bottom bar is short and sits against the bottom edge. */
  if (r.bottom < window.innerHeight - 4) return 0;
  return Math.max(0, window.innerHeight - r.top);
}

/**
 * The slice of screen the visitor can actually see the target in, on a phone.
 *
 * Not the viewport. The sticky topbar covers the top 60px and the sheet covers
 * the bottom third, so centring the target in the viewport — which is what
 * `scrollIntoView({ block: "center" })` does — reliably parks half of a
 * dashboard card underneath the card explaining it.
 */
function freeArea(sheetHeight: number) {
  const vh = window.innerHeight;
  const navH = bottomNavHeight();
  const top = TOPBAR_H + FREE_MARGIN;
  const bottom = vh - navH - SHEET_LIFT - sheetHeight - FREE_MARGIN;
  return { top, bottom, height: Math.max(0, bottom - top) };
}

/** How far the page has to move for the target to sit inside the free area. */
function scrollDeltaFor(el: HTMLElement, sheetHeight: number): number {
  const r = el.getBoundingClientRect();
  const free = freeArea(sheetHeight);
  const pad = SPOTLIGHT_PAD_NARROW;

  /* Taller than the space left over — nothing can show all of it, so show the
     top, where the heading is. Reading a card from its middle is worse than
     losing its footer. */
  if (r.height + pad * 2 > free.height) return r.top - pad - free.top;

  return r.top + r.height / 2 - (free.top + free.bottom) / 2;
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

  /* The sheet's height is needed to decide where to scroll, and the scroll
     happens before the sheet has re-rendered for this step. A ref carries the
     last measured height across that gap; `nudge` below cleans up the residue
     once the real height is known. */
  const sheetHRef = useRef(DEFAULT_SHEET_H);
  const nudgedFor = useRef<string | null>(null);

  const reduced = prefersReducedMotion();
  const targetSelector = step ? `[data-tour="${step.target}"]` : null;
  const navSelector = step ? `[data-tour-nav="${step.nav.key}"]` : null;
  const pad = isNarrow ? SPOTLIGHT_PAD_NARROW : SPOTLIGHT_PAD;
  const navPad = isNarrow ? NAV_PAD_NARROW : NAV_PAD;
  const radius = isNarrow ? 12 : 16;

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
        if (isNarrow) {
          /* Scroll into the space the sheet leaves, not into the middle of the
             viewport. See freeArea(). */
          window.scrollBy({
            top: scrollDeltaFor(el, sheetHRef.current),
            behavior: reduced ? "auto" : "smooth",
          });
        } else {
          el.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: reduced ? "auto" : "smooth",
          });
        }
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
  }, [targetSelector, navSelector, reduced, isNarrow, next]);

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
    if (!tipRef.current) return;
    const h = tipRef.current.offsetHeight;
    setTipHeight(h);
    sheetHRef.current = h;
  }, [step, isNarrow, box]);

  /**
   * One corrective nudge per step, on phones.
   *
   * The scroll above ran against the PREVIOUS step's sheet height, because this
   * step's sheet had not been laid out yet. Steps differ by fifty or sixty
   * pixels of copy, which is enough to clip the bottom of a spotlight. Once the
   * real height is known, close the gap — but only once per step and only if it
   * is worth a visible movement, or the scroll listener that remeasures `box`
   * and this effect would push each other around the page forever.
   */
  useEffect(() => {
    if (!isNarrow || !step || !box) return;
    const key = `${step.id}:${tipHeight}`;
    if (nudgedFor.current === key) return;
    nudgedFor.current = key;

    const el = targetSelector ? findVisible(targetSelector) : null;
    if (!el) return;
    const delta = scrollDeltaFor(el, tipHeight);
    if (Math.abs(delta) < 8) return;
    window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
  }, [isNarrow, step, box, tipHeight, targetSelector, reduced]);

  /* Move focus onto the card for every step, so a keyboard or screen-reader
     user is reading the same thing the spotlight is pointing at. `preventScroll`
     because on a phone the card is fixed over the navigation, and letting the
     browser scroll to it would undo the scroll that just put the target in
     view. */
  useEffect(() => {
    if (step && box && tipRef.current) tipRef.current.focus({ preventScroll: true });
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
    /* A docked sheet, edge to edge, sitting on top of the bottom navigation
       rather than over it — on a phone that bar is the "you are here" indicator
       and a sheet covering it hides the very thing this step points out. Full
       width because every 8px of side margin is another wrapped line, and a
       floating slab with four rounded corners reads as heavier than a sheet
       attached to the bottom of the screen. */
    tipStyle = {
      left: 0,
      right: 0,
      bottom: bottomNavHeight() + SHEET_LIFT,
      marginLeft: "auto",
      marginRight: "auto",
      width: "auto",
      maxWidth: SHEET_MAX_WIDTH,
      borderRadius: "20px 20px 0 0",
      padding: "16px 18px 14px",
      overflow: "hidden",
      boxShadow: "0 -8px 32px -8px rgba(13, 13, 13, 0.30)",
    };
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

  /**
   * On a phone, the spotlight stops at the top edge of the sheet.
   *
   * The dashboard cards are two or three screens tall, so the ring around one
   * runs off the bottom of the display — and because the ring is a fixed-
   * position box, its left and right borders carry on drawing down either side
   * of the sheet and the navigation bar, which looks like two stray orange
   * lines rather than a highlight. Clipping the ring to the sheet's top edge
   * hides its bottom border underneath the sheet and stops the sides dead.
   */
  const ringTop = box.top - pad;
  const ringHeight = isNarrow
    ? Math.max(
        0,
        Math.min(box.top + box.height + pad, vh - bottomNavHeight() - SHEET_LIFT - tipHeight) -
          ringTop,
      )
    : /* Deliberately the original expression rather than the clamped one. They
         are algebraically equal, but `box.top` is fractional and the two round
         differently, which moved the desktop ring's bottom border by a pixel. */
      box.height + pad * 2;

  const isLast = index === total - 1;
  const titleId = `tour-title-${step.id}`;
  const bodyId = `tour-body-${step.id}`;
  const ease = reduced
    ? "none"
    : "top .22s ease, left .22s ease, width .22s ease, height .22s ease";

  /* Short copy on a phone. Same step, same point, roughly half the words: three
     wrapped lines at 358px instead of six, which is most of the difference
     between a sheet that explains the screen and a sheet that replaces it. */
  const bodyText = isNarrow ? (step.bodyShort ?? step.body) : step.body;

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
              x={box.left - pad}
              y={ringTop}
              width={box.width + pad * 2}
              height={ringHeight}
              rx={radius}
              fill="#000"
            />
            {navBox ? (
              <rect
                x={navBox.left - navPad}
                y={navBox.top - navPad}
                width={navBox.width + navPad * 2}
                height={navBox.height + navPad * 2}
                rx={isNarrow ? 0 : 10}
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
          top: ringTop,
          left: box.left - pad,
          width: box.width + pad * 2,
          height: ringHeight,
          borderRadius: radius,
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
            top: navBox.top - navPad,
            left: navBox.left - navPad,
            width: navBox.width + navPad * 2,
            height: navBox.height + navPad * 2,
            borderRadius: isNarrow ? 0 : 10,
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
        {/* Progress, as three pixels along the top edge instead of a line of
            text. On a phone every row of chrome is a row of copy that did not
            fit; this one costs nothing and is read at a glance. */}
        {isNarrow ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 3,
              width: `${((index + 1) / total) * 100}%`,
              backgroundColor: ACCENT,
              borderRadius: "0 3px 3px 0",
              transition: reduced ? "none" : "width .25s ease",
            }}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {/* Says the section in words, next to a nav item lit up in the same
              moment. The words alone would be a label; the highlight alone would
              be a glow someone has to interpret. Together they are an answer.
              On a phone the pill loses its background — an orange chip next to
              an orange spotlight ring reads as a second target. */}
          {isNarrow ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: "#9a3412",
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: ACCENT,
                  flexShrink: 0,
                }}
              />
              <span className="truncate">You are in {step.nav.label}</span>
            </span>
          ) : (
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
          )}

          {isNarrow ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#9ca3af",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {index + 1}/{total}
            </span>
          ) : (
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
          )}
        </div>

        <h2
          id={titleId}
          style={{
            marginTop: isNarrow ? 6 : 10,
            fontWeight: 700,
            fontSize: isNarrow ? 15 : 17,
            /* Only on a phone. Leaving the desktop heading to inherit its
               line-height keeps the desktop card pixel-for-pixel what it was. */
            lineHeight: isNarrow ? 1.3 : undefined,
            color: "#111827",
          }}
        >
          {step.title}
        </h2>

        <p
          id={bodyId}
          style={{
            marginTop: isNarrow ? 5 : 8,
            fontSize: isNarrow ? 13 : 14,
            lineHeight: isNarrow ? 1.5 : 1.55,
            color: "#6b7280",
          }}
        >
          {bodyText}
        </p>

        <div
          className="flex items-center justify-between gap-3"
          style={{ marginTop: isNarrow ? 14 : 20 }}
        >
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
                  height: isNarrow ? 40 : 38,
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
                height: isNarrow ? 40 : 38,
                padding: isNarrow ? "0 22px" : "0 18px",
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
