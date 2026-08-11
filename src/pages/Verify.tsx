import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { Btn, ErrorBanner } from "../components/ui-primitives";
import { DEMO_OTP, useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

const LENGTH = 6;
const COUNTDOWN_SECONDS = 5 * 60;

/** OTP verification — source of truth §4.1, Page 4. */
export default function Verify() {
  const navigate = useNavigate();
  const { user, pendingEmail, verifyOtp, resendOtp } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const complete = code.length === LENGTH && digits.every(Boolean);
  const expired = seconds <= 0;

  /* countdown */
  useEffect(() => {
    if (seconds <= 0) return;
    const t = window.setInterval(() => setSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [seconds]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  /* once verified, Supabase signs the user in — move them along */
  useEffect(() => {
    if (user) navigate("/welcome", { replace: true });
  }, [user, navigate]);

  const clock = useMemo(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [seconds]);

  const setDigit = (index: number, value: string) => {
    setError(null);
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((d) => {
        const next = [...d];
        next[index] = "";
        return next;
      });
      return;
    }
    setDigits((d) => {
      const next = [...d];
      // typing over a filled box, or pasting several digits at once
      for (let i = 0; i < clean.length && index + i < LENGTH; i += 1) {
        next[index + i] = clean[i];
      }
      return next;
    });
    const nextIndex = Math.min(index + clean.length, LENGTH - 1);
    inputs.current[nextIndex]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      inputs.current[index - 1]?.focus();
      setDigits((d) => {
        const next = [...d];
        next[index - 1] = "";
        return next;
      });
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(LENGTH).fill("");
    for (let i = 0; i < text.length; i += 1) next[i] = text[i];
    setDigits(next);
    inputs.current[Math.min(text.length, LENGTH - 1)]?.focus();
  };

  const submit = useCallback(async () => {
    if (!complete || loading) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(code);
      navigate("/welcome", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code. Please try again or request a new one.");
      setDigits(Array(LENGTH).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [complete, loading, verifyOtp, code, navigate]);

  const resend = async () => {
    setError(null);
    setDigits(Array(LENGTH).fill(""));
    setSeconds(COUNTDOWN_SECONDS);
    inputs.current[0]?.focus();
    try {
      await resendOtp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    }
  };

  // Nothing to verify and nobody signed in — start over.
  if (!pendingEmail && !user) return <Navigate to="/signup" replace />;

  const displayEmail = pendingEmail ?? user?.email ?? "you@example.com";

  return (
    <AuthShell
      title="Verify your email"
      subtitle={
        <>
          We sent an email to{" "}
          <strong className="font-semibold text-[#0D0D0D]">{displayEmail}</strong>. If it contains a
          6-digit code, type it below. If it contains a link, just click the link and you are done.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex gap-3" role="group" aria-label="6-digit verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              onFocus={(e) => {
                setFocused(i);
                e.target.select();
              }}
              onBlur={() => setFocused(null)}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={LENGTH}
              aria-label={`Digit ${i + 1}`}
              aria-invalid={Boolean(error) || undefined}
              className="text-center outline-none transition-colors"
              style={{
                height: 60,
                borderRadius: 8,
                border: error
                  ? "1.5px solid #DC2626"
                  : focused === i
                    ? "2px solid #0D0D0D"
                    : "1.5px solid #E8E8E8",
                fontSize: 24,
                fontWeight: 700,
                color: "#0D0D0D",
                backgroundColor: "#fff",
                flex: "1 1 0",
                minWidth: 0,
                maxWidth: 52,
              }}
            />
          ))}
        </div>

        {error ? <p className="mt-3 text-[12px] text-[#DC2626]">{error}</p> : null}

        <div className="mt-4 flex flex-col gap-1">
          <p className="text-[14px] text-[#6B7280]">
            {expired ? (
              <span className="text-[#DC2626]">Code expired.</span>
            ) : (
              <>Code expires in {clock}</>
            )}
          </p>
          <p className="text-[14px] text-[#6B7280]">
            Nothing arrived?{" "}
            <button
              type="button"
              onClick={resend}
              className="font-semibold text-[#0D0D0D] hover:underline"
            >
              Send it again
            </button>
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="mt-4">
            <ErrorBanner>
              Demo mode — the code is <strong className="font-bold">{DEMO_OTP}</strong>.
            </ErrorBanner>
          </div>
        ) : (
          /* Supabase's default "Confirm signup" template uses {{ .ConfirmationURL }},
             which sends a LINK and no code at all. The boxes above only work once
             the template includes {{ .Token }}. Saying so beats a landlord staring
             at six empty boxes with nothing to type. See SETUP_SUPABASE.md step 5e. */
          <p className="mt-4 rounded-lg bg-[#F9F9F9] px-4 py-3 text-[12px] leading-relaxed text-[#6B7280]">
            Emails can take a minute, and they sometimes land in spam. Signing up with an address you
            cannot actually open is the usual reason nothing arrives.
          </p>
        )}

        <div className="mt-6">
          <Btn type="submit" disabled={!complete} loading={loading}>
            Verify
          </Btn>
        </div>
      </form>
    </AuthShell>
  );
}
