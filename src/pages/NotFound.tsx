import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <Logo className="h-7 w-auto" />
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0D0D0D" }}>Page not found</h1>
        <p className="mt-2" style={{ fontSize: 15, color: "#4B5563" }}>
          That link does not lead anywhere in Domus.
        </p>
      </div>
      <Link
        to={user ? "/dashboard" : "/"}
        className="inline-flex h-12 items-center justify-center rounded-lg bg-[#0D0D0D] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#333333]"
      >
        {user ? "Back to dashboard" : "Back to home"}
      </Link>
    </div>
  );
}
