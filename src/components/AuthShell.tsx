import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { isSupabaseConfigured } from "../lib/supabase";

/**
 * Shared layout for Sign up / Sign in / Verify — source of truth §4.1.
 * Centered column, max-width 480px, vertically centered, "← Back" flowing
 * with the content rather than fixed.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  backTo,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Explicit destination. Needed when the page was opened from an email link,
   *  where there is no history to go back to. */
  backTo?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col justify-center bg-white px-6 py-12">
      <div className="mx-auto w-full max-w-[480px]">
        <button
          type="button"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          className="inline-flex items-center gap-1.5 text-[14px] text-[#6B7280] transition-colors hover:text-[#0D0D0D]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>

        <h1 className="mt-8 text-[28px] font-extrabold leading-tight text-[#0D0D0D]">{title}</h1>
        {subtitle ? <p className="mt-2 text-[15px] text-[#6B7280]">{subtitle}</p> : null}

        <div className="mt-8">{children}</div>

        {footer ? <div className="mt-5">{footer}</div> : null}

        {!isSupabaseConfigured ? <DemoModeNote /> : null}
      </div>
    </div>
  );
}

export function DemoModeNote() {
  return (
    <p className="mt-8 rounded-lg border border-[#E8E8E8] bg-[#F9F9F9] px-4 py-3 text-[12px] leading-relaxed text-[#6B7280]">
      <strong className="font-semibold text-[#0D0D0D]">Demo mode.</strong> No database is connected,
      so accounts and data live in this browser only. The email verification code is{" "}
      <strong className="font-semibold text-[#0D0D0D]">123456</strong>. Add your Supabase keys to{" "}
      <code>.env</code> for real accounts.
    </p>
  );
}
