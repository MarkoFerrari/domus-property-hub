import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { AuthShell } from "../components/AuthShell";
import { Btn, ErrorBanner, GoogleGlyph, LabelledInput } from "../components/ui-primitives";
import { useAuth } from "../lib/auth";

/** Sign up — source of truth §4.1, Page 2. */
export default function SignUp() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  const nameError = submitted && !fullName.trim() ? "Enter your name." : undefined;
  const emailError =
    submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : undefined;
  const passwordError =
    submitted && password.length < 8 ? "Password must be at least 8 characters." : undefined;
  const repeatError = submitted && repeat && repeat !== password ? "Passwords don't match." : undefined;
  const termsError = submitted && !agreed ? "You must accept the terms to continue." : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setBanner(null);
    setEmailTaken(false);

    if (
      !fullName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 8 ||
      (repeat && repeat !== password) ||
      !agreed
    ) {
      return;
    }

    setLoading(true);
    try {
      await signUp({ fullName: fullName.trim(), email: email.trim(), password });
      navigate("/verify");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      if (message.toLowerCase().includes("already exists")) setEmailTaken(true);
      setBanner(message);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Google sign-in is unavailable.");
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Free during the pilot. No card required.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <LabelledInput
          label="Full name"
          placeholder="Your Name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={nameError}
        />

        <LabelledInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />

        <LabelledInput
          label="Password"
          type={showPw ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper="At least 8 characters."
          error={passwordError}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="p-1"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />

        {/* Repeat password: desktop only, per §4.1 */}
        <div className="hidden sm:block">
          <LabelledInput
            label="Repeat password"
            type={showRepeat ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            error={repeatError}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowRepeat((s) => !s)}
                aria-label={showRepeat ? "Hide password" : "Show password"}
                className="p-1"
              >
                {showRepeat ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
        </div>

        <div className="mt-1">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D0D0D]"
            />
            <span className="text-[14px] text-[#6B7280]">
              I agree to the{" "}
              <a href="#terms" className="text-[#2563EB] underline">
                Terms of Service
              </a>{" "}
              and the{" "}
              <a href="#privacy" className="text-[#2563EB] underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {termsError ? <p className="mt-1.5 text-[12px] text-[#DC2626]">{termsError}</p> : null}
        </div>

        {banner ? (
          <ErrorBanner>
            {emailTaken ? (
              <>
                An account with this email already exists.{" "}
                <Link to="/signin" className="text-[#DC2626] underline">
                  Sign in instead
                </Link>
                .
              </>
            ) : (
              banner
            )}
          </ErrorBanner>
        ) : null}

        <div className="mt-1 flex flex-col gap-3">
          <Btn type="submit" loading={loading}>
            Create account
          </Btn>
          <Btn type="button" variant="secondary" onClick={google} disabled={loading}>
            <GoogleGlyph />
            Continue with Google
          </Btn>
        </div>
      </form>
    </AuthShell>
  );
}
