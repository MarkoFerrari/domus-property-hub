import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";

import { AuthShell } from "../components/AuthShell";
import { Btn, ErrorBanner, LabelledInput } from "../components/ui-primitives";
import { useAuth } from "../lib/auth";

/**
 * Step one of password reset.
 *
 * The confirmation is intentionally identical whether or not the address has an
 * account. Anything else turns this form into a way to check which landlords
 * use Domus.
 */
export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you signed up with.");
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If that address has a Domus account, a reset link is on its way. The link works once and expires in an hour."
        backTo="/signin"
      >
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F0FDF4]">
            <MailCheck size={26} color="#16A34A" aria-hidden="true" />
          </div>
          <p className="text-[14px] leading-relaxed text-[#4B5563]">
            Nothing in your inbox after a few minutes? Check spam, then try again with a different
            address.
          </p>
          <div className="flex w-full flex-col gap-3">
            <Btn variant="secondary" onClick={() => setSent(false)}>
              Use a different email
            </Btn>
            <Link
              to="/signin"
              className="text-center text-[14px] font-semibold text-[#0D0D0D] underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
      backTo="/signin"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <LabelledInput
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(error)}
        />

        {error ? <ErrorBanner>{error}</ErrorBanner> : null}

        <Btn type="submit" loading={loading}>
          Send reset link
        </Btn>
      </form>
    </AuthShell>
  );
}
