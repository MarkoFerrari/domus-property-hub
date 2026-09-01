import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "./lib/auth";
import { useStore } from "./lib/store";
import { Logo } from "./components/Logo";

import Landing from "./pages/Landing";
/* SignUp is deliberately not imported: the page still exists and still works,
   but leaving it wired in would ship the whole sign-up flow in the bundle for a
   route nobody can reach. To reopen sign-ups, restore this import and swap the
   /signup route below back to <PublicOnly><SignUp /></PublicOnly>. */
import SignIn from "./pages/SignIn";
import Verify from "./pages/Verify";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Privacy from "./pages/Privacy";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import PropertiesList from "./pages/PropertiesList";
import PropertyNew from "./pages/PropertyNew";
import PropertyDetail from "./pages/PropertyDetail";
import PropertyEdit from "./pages/PropertyEdit";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";

/* -------------------------------- gates ---------------------------------- */

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
      <Logo className="h-8 w-auto opacity-90" />
      <p className="text-[13px] text-[#4B5563]">Loading your portfolio…</p>
    </div>
  );
}

/** Signed out -> /signin, remembering where they were headed. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * First run after sign-up sends the landlord through onboarding.
 *
 * The `error` check matters: if the portfolio failed to load we do not know
 * whether they have onboarded, and guessing "no" would drag an established
 * landlord back through setup over a dropped connection. Letting them through
 * shows AppShell's error banner with a retry, which is the honest outcome.
 */
function RequireOnboarded({ children }: { children: ReactNode }) {
  const { loading, onboarded, error } = useStore();
  if (loading) return <Splash />;
  if (!onboarded && !error) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** Signed-in landlords never see the marketing or auth pages. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoute({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireOnboarded>{children}</RequireOnboarded>
    </RequireAuth>
  );
}

/* -------------------------------- routes ---------------------------------- */

export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      {/* Sign-up is closed during the pilot. The route stays mapped rather than
          deleted so old links and bookmarks land somewhere sensible instead of
          on the 404 page. See the import block at the top of this file for how
          to reopen it once custom SMTP is configured. */}
      <Route path="/signup" element={<Navigate to="/signin" replace />} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      {/* NOT PublicOnly: the reset link signs you in before this renders, so
          gating it on being signed out would bounce every user to /dashboard. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* onboarding — behind auth but before the onboarding gate */}
      <Route path="/welcome" element={<RequireAuth><Welcome /></RequireAuth>} />

      {/* app */}
      <Route path="/dashboard" element={<AppRoute><Dashboard /></AppRoute>} />
      <Route path="/properties" element={<AppRoute><PropertiesList /></AppRoute>} />
      <Route path="/properties/new" element={<AppRoute><PropertyNew /></AppRoute>} />
      <Route path="/properties/:id" element={<AppRoute><PropertyDetail /></AppRoute>} />
      <Route path="/properties/:id/edit" element={<AppRoute><PropertyEdit /></AppRoute>} />
      <Route path="/notifications" element={<AppRoute><Notifications /></AppRoute>} />
      <Route path="/settings" element={<AppRoute><Settings /></AppRoute>} />
      <Route path="/help" element={<AppRoute><Help /></AppRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
