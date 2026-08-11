import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { AuthShell } from "../components/AuthShell";
import { Btn, ErrorBanner, GoogleGlyph, LabelledInput } from "../components/ui-primitives";
import { useAuth } from "../lib/auth";

/** Sign in — source of truth §4.1, Page 3. */
export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  const failed = Boolean(banner);
  const emailError =
    submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : undefined;
  const passwordError = submitted && password.length < 8 ? "At least 8 characters." : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setBanner(null);
    setNoAccount(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return;

    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      if (message.toLowerCase().includes("no account found")) setNoAccount(true);
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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your portfolio."
      footer={
        <p className="text-center text-[14px] text-[#6B7280]">
          No account yet?{" "}
          <Link to="/signup" className="font-semibold text-[#0D0D0D] underline">
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <LabelledInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={failed}
          error={emailError}
        />

        <LabelledInput
          label="Password"
          type={showPw ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper="At least 8 characters."
          invalid={failed}
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

        <Link
          to="/forgot-password"
          className="-mt-2 self-start text-[13px] font-semibold text-[#6B7280] underline hover:text-[#0D0D0D]"
        >
          Forgot your password?
        </Link>

        {banner ? (
          <ErrorBanner>
            {noAccount ? (
              <>
                No account found with this email.{" "}
                <Link to="/signup" className="text-[#DC2626] underline">
                  Create one
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
            Sign in
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
