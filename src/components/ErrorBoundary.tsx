import { Component, type ErrorInfo, type ReactNode } from "react";

import { Logo } from "./Logo";

/**
 * The last line of defence.
 *
 * WHY THIS EXISTS: without it, one thrown error anywhere in the tree left the
 * landlord on a blank white page with no way back and no idea what happened.
 * For an app people trust with tax deadlines, a white screen reads as "my data
 * is gone", which is the most expensive wrong conclusion Domus can cause.
 *
 * Deliberately plain: it must not depend on the store, the router or anything
 * else that might be the thing that just broke.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-reporting service is wired up yet. The console is what a
    // developer has during a pilot, so at least make it useful.
    console.error("Domus crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="w-full max-w-[440px] text-center">
          <Logo className="mx-auto h-7 w-auto" />

          <h1 className="mt-8 text-[22px] font-extrabold text-[#0D0D0D]">
            Something broke on this screen.
          </h1>

          <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
            Your data has not been touched. Nothing you recorded has been lost. Reloading usually
            clears it.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-lg bg-[#171717] px-6 text-[14px] font-semibold text-white"
            >
              Reload Domus
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              className="h-11 rounded-lg border border-[#e5e7eb] px-6 text-[14px] font-semibold text-[#374151]"
            >
              Back to dashboard
            </button>
          </div>

          <details className="mt-8 text-left">
            <summary className="cursor-pointer text-[12px] font-semibold text-[#9ca3af]">
              Technical detail (for support)
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#F9F9F9] p-3 text-[11px] leading-relaxed text-[#6B7280]">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
