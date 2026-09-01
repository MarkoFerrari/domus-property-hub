import { Link } from "react-router-dom";
import { Check, Clock, Euro } from "lucide-react";
import type { ReactNode } from "react";

import { Logo, LogoLockup } from "../components/Logo";
import { appPath } from "../lib/basePath";
import { startDemo } from "../lib/demoMode";

/**
 * Landing page — source of truth §4.1, Page 1.
 * Desktop: two-column split, dark hero left, content right.
 * Tablet/mobile: single column, no hero image.
 */

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=70";

const FEATURES: Array<{ icon: ReactNode; label: string; caption: string }> = [
  {
    icon: <Check size={20} aria-hidden="true" />,
    label: "Never miss an AADE declaration",
    caption: "Monthly filings tracked per property, zero-income months included",
  },
  {
    icon: <Euro size={20} aria-hidden="true" />,
    label: "Know if the rent actually arrived",
    caption: "One-tap confirmation with a timestamped audit log",
  },
  {
    icon: <Clock size={20} aria-hidden="true" />,
    label: "Certificate reminders",
    caption: "Alerts well before anything expires",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white lg:flex">
      {/* Hero — desktop only */}
      <div className="hidden lg:flex lg:w-1/2 lg:p-4">
        <div
          className="relative flex w-full items-center justify-center overflow-hidden"
          style={{ borderRadius: 16 }}
        >
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(13,13,13,0.6)" }}
            aria-hidden="true"
          />
          <div className="relative px-8">
            <LogoLockup variant="light" width={340} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-screen w-full flex-col justify-center px-6 py-12 md:px-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-[480px]">
          {/* Mobile / tablet wordmark */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo className="h-8 w-auto" />
          </div>

          <h1
            className="text-[32px] font-extrabold text-[#0D0D0D] sm:text-[36px]"
            style={{ lineHeight: 1.15 }}
          >
            Every deadline, every euro, one screen.
          </h1>

          <p className="mt-4 text-[16px] text-[#4B5563]" style={{ lineHeight: 1.6 }}>
            Domus keeps small Greek landlords out of fine territory and on top of their rental
            income, for both Airbnb and long-term leases.
          </p>

          <ul className="mt-8">
            {FEATURES.map((f, i) => (
              <li
                key={f.label}
                className="flex items-start gap-4 py-6 first:pt-0 last:pb-0"
                style={{ borderTop: i === 0 ? "none" : "1px solid #E8E8E8" }}
              >
                <span className="mt-0.5 shrink-0 text-[#0D0D0D]">{f.icon}</span>
                <span>
                  <span className="block text-[14px] font-semibold text-[#0D0D0D]">{f.label}</span>
                  <span className="mt-0.5 block text-[13px] text-[#4B5563]">{f.caption}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3">
            {/* A real <button>, not a Link: entering the demo clears any previous
                visit and reloads, which react-router cannot do. */}
            <button
              type="button"
              onClick={() => startDemo(appPath("welcome"))}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#0D0D0D] text-[15px] font-semibold text-white transition-colors hover:bg-[#333333]"
            >
              Try the demo
            </button>
            <Link
              to="/signin"
              className="inline-flex h-12 w-full items-center justify-center rounded-lg border-[1.5px] border-[#0D0D0D] bg-white text-[15px] font-semibold text-[#0D0D0D] transition-colors hover:bg-[#F9F9F9]"
            >
              I already have an account
            </Link>
          </div>

          {/* Set the expectation BEFORE the click, not after. Someone who enters
              three properties and then discovers the data was never saved has
              been wasted, and will not come back for the real thing. */}
          <div
            className="mt-6 rounded-xl border px-4 py-3"
            style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}
          >
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "#92400E" }}>
              <strong style={{ fontWeight: 600 }}>This is a demo.</strong> Anything you add is kept
              in this browser only, never sent anywhere, and gone as soon as you leave or sign out.
              Start again and you start empty. Accounts that keep your data are coming shortly.
            </p>
          </div>

          <p className="mt-6 text-[12px] leading-relaxed text-[#6B7280]">
            Domus records and reminds. It never moves money and never edits your listings.
          </p>
        </div>
      </div>
    </div>
  );
}
