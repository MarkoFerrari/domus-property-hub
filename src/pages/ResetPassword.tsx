import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "../components/AuthShell";
import { Btn, ErrorBanner, LabelledInput } from "../components/ui-primitives";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

/**
 * Step two of password reset, opened from the emailed link.
 *
 * Supabase turns the link into a session automatically (detectSessionInUrl is
 * on), so by the time this renders the user is provisionally signed in and
 * `updateUser` is allowed. If that did not happen the link was stale, and
 * saying so plainly is better than a generic failure after they have typed a
 * new password twice.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady("invalid");
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setReady(data.session ? "ok" : "invalid");
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      toast.success("Password updated. You are signed in.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setLoading(false);
    }
  };

  if (ready === "checking") {
    return (
      <AuthShell title="Checking your link" backTo="/signin">
        <p className="text-[14px] text-[#6B7280]">One moment.</p>
      </AuthShell>
    );
  }

  if (ready === "invalid") {
    return (
      <AuthShell
        title="That link has expired"
        subtitle="Reset links work once and last an hour. Request a fresh one and it will work."
        backTo="/signin"
      >
        <div className="flex flex-col gap-3">
          <Link to="/forgot-password">
            <Btn type="button">Send a new link</Btn>
          </Link>
          <Link
            to="/signin"
            className="text-center text-[14px] font-semibold text-[#0D0D0D] underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This signs you in straight away." backTo="/signin">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <LabelledInput
          label="New password"
          type={showPw ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper="At least 8 characters."
          invalid={Boolean(error)}
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

        <LabelledInput
          label="Confirm new password"
          type={showPw ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          invalid={Boolean(error)}
        />

        {error ? <ErrorBanner>{error}</ErrorBanner> : null}

        <Btn type="submit" loading={loading}>
          Save new password
        </Btn>
      </form>
    </AuthShell>
  );
}
