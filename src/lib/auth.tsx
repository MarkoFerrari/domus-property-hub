/**
 * Authentication.
 *
 * Supabase Auth when configured: real accounts, real password hashing, real
 * 6-digit email verification codes, sessions that survive a refresh.
 *
 * Demo mode otherwise: the exact same screens and flows, backed by
 * localStorage, so the app is fully explorable before anyone touches a
 * database. The demo verification code is 123456 and the UI says so.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { appUrl } from "./basePath";
import { isSupabaseConfigured, supabase } from "./supabase";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
};

export const DEMO_OTP = "123456";

const DEMO_USER_KEY = "domus.demo.user";
const DEMO_PENDING_KEY = "domus.demo.pending";
const DEMO_PENDING_NAME_KEY = "domus.demo.pendingName";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** Email awaiting OTP verification, if any. */
  pendingEmail: string | null;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Sends the reset link. Resolves even for unknown emails, on purpose. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the session created by the reset link. */
  updatePassword: (password: string) => Promise<void>;
  /** GDPR erasure. Deletes the account and everything cascading from it. */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Turns a Supabase auth error into copy a landlord can act on. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password. Please try again.";
  if (m.includes("email not confirmed")) return "Please verify your email first. Check your inbox for the code.";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists.";
  }
  if (m.includes("token has expired") || m.includes("expired")) {
    return "That code has expired. Request a new one.";
  }
  if (m.includes("invalid") && m.includes("token")) {
    return "Incorrect code. Please try again or request a new one.";
  }
  if (m.includes("password should be")) return "Password must be at least 8 characters.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  /* Google is wired in the app but the provider has to be switched on in the
     Supabase dashboard with real OAuth credentials. Until someone does that,
     Supabase returns "Unsupported provider", which tells a landlord nothing. */
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "Google sign-in is not switched on yet. Use your email and password for now.";
  }
  if (m.includes("redirect_uri_mismatch")) {
    return "Google sign-in is misconfigured. Please use email and password, and let us know.";
  }
  return message;
}

function readDemoUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  /* ---------------------------------------------------------------- boot -- */
  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setUser(readDemoUser());
      try {
        setPendingEmail(localStorage.getItem(DEMO_PENDING_KEY));
      } catch {
        /* ignore */
      }
      setLoading(false);
      return;
    }

    const sb = supabase!;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      const s = data.session;
      setUser(
        s
          ? {
              id: s.user.id,
              email: s.user.email ?? "",
              fullName: (s.user.user_metadata?.full_name as string) ?? "",
            }
          : null,
      );
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(
        session
          ? {
              id: session.user.id,
              email: session.user.email ?? "",
              fullName: (session.user.user_metadata?.full_name as string) ?? "",
            }
          : null,
      );
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* -------------------------------------------------------------- sign up -- */
  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ fullName, email, password }) => {
    if (!isSupabaseConfigured) {
      const existing = readDemoUser();
      if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
        throw new Error("An account with this email already exists.");
      }
      /* The password is deliberately NOT stored. This used to write
         {fullName, email, password} to localStorage and never clean it up, so a
         reused password sat in the browser indefinitely. Demo mode does not
         check passwords anyway, so keeping it bought nothing. */
      void password;
      localStorage.setItem(DEMO_PENDING_KEY, email);
      localStorage.setItem(DEMO_PENDING_NAME_KEY, JSON.stringify({ fullName, email }));
      setPendingEmail(email);
      return;
    }

    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(friendlyAuthError(error.message));

    // Supabase returns an empty identities array when the email already exists.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email already exists.");
    }
    setPendingEmail(email);
  }, []);

  /* -------------------------------------------------------------- sign in -- */
  const signIn = useCallback<AuthContextValue["signIn"]>(async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      const existing = readDemoUser();
      if (!existing) {
        throw new Error("No account found with this email.");
      }
      if (existing.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error("Incorrect email or password. Please try again.");
      }
      setUser(existing);
      return;
    }
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error("Google sign-in needs Supabase. Connect it in .env, then enable the Google provider.");
    }
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl("dashboard") },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  /* ----------------------------------------------------------- verify OTP -- */
  const verifyOtp = useCallback<AuthContextValue["verifyOtp"]>(
    async (code) => {
      if (!isSupabaseConfigured) {
        if (code !== DEMO_OTP) {
          throw new Error("Incorrect code. Please try again or request a new one.");
        }
        const raw = localStorage.getItem(DEMO_PENDING_NAME_KEY);
        const parsed = raw ? (JSON.parse(raw) as { fullName: string; email: string }) : null;
        const next: AuthUser = {
          id: "demo-user",
          email: parsed?.email ?? pendingEmail ?? "you@example.com",
          fullName: parsed?.fullName ?? "Demo Landlord",
        };
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(next));
        localStorage.removeItem(DEMO_PENDING_KEY);
        /* Was previously left behind on every signup. */
        localStorage.removeItem(DEMO_PENDING_NAME_KEY);
        setPendingEmail(null);
        setUser(next);
        return;
      }

      const email = pendingEmail;
      if (!email) throw new Error("We lost track of which email to verify. Please sign up again.");
      const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "signup" });
      if (error) throw new Error(friendlyAuthError(error.message));
      setPendingEmail(null);
    },
    [pendingEmail],
  );

  const resendOtp = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const email = pendingEmail;
    if (!email) return;
    const { error } = await supabase!.auth.resend({ type: "signup", email });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, [pendingEmail]);

  /* ------------------------------------------------------ password reset -- */

  /**
   * Deliberately resolves whether or not the email has an account.
   *
   * Telling a stranger "no account found" turns this form into a way to test
   * whether a given landlord uses Domus. The screen says "if that address has
   * an account, a link is on its way" and means it.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        "Password reset needs a connected database. In demo mode there is no real account to reset.",
      );
    }
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: appUrl("reset-password"),
    });
    // A rate-limit is worth surfacing; "user not found" is not.
    if (error && /rate limit|too many/i.test(error.message)) {
      throw new Error(friendlyAuthError(error.message));
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!isSupabaseConfigured) throw new Error("Password reset needs a connected database.");
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  /* --------------------------------------------------------- erase account -- */

  /**
   * Calls the `delete-account` edge function, which is the only place with the
   * service-role key needed to remove an auth user. Every table cascades from
   * auth.users, so one delete takes the whole portfolio with it.
   */
  const deleteAccount = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error("There is no server account to delete in demo mode. Use Reset all demo data.");
    }
    const sb = supabase!;
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Please sign in again before deleting your account.");

    const { error } = await sb.functions.invoke("delete-account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      throw new Error(
        "Could not delete your account. Nothing has been removed. Please contact support.",
      );
    }
    await sb.auth.signOut();
    setUser(null);
  }, []);

  /* ------------------------------------------------------------- sign out -- */
  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      return;
    }
    await supabase!.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      pendingEmail,
      signUp,
      signIn,
      signInWithGoogle,
      verifyOtp,
      resendOtp,
      signOut,
      requestPasswordReset,
      updatePassword,
      deleteAccount,
    }),
    [
      user, loading, pendingEmail, signUp, signIn, signInWithGoogle, verifyOtp, resendOtp, signOut,
      requestPasswordReset, updatePassword, deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
