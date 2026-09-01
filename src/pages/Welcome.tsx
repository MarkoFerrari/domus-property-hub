import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CalendarClock, Euro, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "../components/Logo";
import { Btn } from "../components/ui-primitives";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";

/** Onboarding — the gate every new landlord passes through once. */
export default function Welcome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { completeOnboarding, seedDemo, properties } = useStore();
  const [busy, setBusy] = useState<"none" | "demo" | "start">("none");

  const firstName = (user?.fullName || "").trim().split(" ")[0];

  const start = async () => {
    setBusy("start");
    try {
      await completeOnboarding();
      navigate(properties.length > 0 ? "/dashboard" : "/properties/new", { replace: true });
    } finally {
      setBusy("none");
    }
  };

  const loadDemo = async () => {
    setBusy("demo");
    try {
      const n = await seedDemo();
      await completeOnboarding();
      toast.success(n > 0 ? `${n} example properties added` : "You already have properties");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the example portfolio.");
    } finally {
      setBusy("none");
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-white px-6 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <Logo className="h-7 w-auto" />

        <h1 className="mt-8 text-[28px] font-extrabold leading-tight text-[#0D0D0D]">
          {firstName ? `Welcome, ${firstName}.` : "Welcome to Domus."}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4B5563]">
          Domus watches three things for every property you add, so nothing quietly turns into a
          fine.
        </p>

        <ul className="mt-8 flex flex-col gap-5">
          <Point
            icon={<CalendarClock size={20} aria-hidden="true" />}
            title="Short-term declarations"
            body="Two obligations every month, the stay declaration and ΤΑΚΚ, each with its own deadline. Months that earned nothing count too."
          />
          <Point
            icon={<Euro size={20} aria-hidden="true" />}
            title="Rent that actually arrived"
            body="Confirm each month in one tap. Domus keeps the timestamped record; it never touches your bank."
          />
          <Point
            icon={<ShieldCheck size={20} aria-hidden="true" />}
            title="Certificates before they expire"
            body="Six certificates per property. You get warned while there is still time to act."
          />
        </ul>

        <div className="mt-10 flex flex-col gap-3">
          <Btn onClick={start} loading={busy === "start"} disabled={busy !== "none"}>
            <Building2 size={16} aria-hidden="true" />
            Add my first property
          </Btn>
          <Btn variant="secondary" onClick={loadDemo} loading={busy === "demo"} disabled={busy !== "none"}>
            Explore with an example portfolio
          </Btn>
        </div>

        <p className="mt-4 text-center text-[12px] text-[#6B7280]">
          The example portfolio adds five Athens properties you can edit or delete at any time.
        </p>
      </div>
    </div>
  );
}

function Point({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: "#fff4ee", color: "#FF6B35" }}
      >
        {icon}
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-[#0D0D0D]">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-[#4B5563]">{body}</span>
      </span>
    </li>
  );
}
