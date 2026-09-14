"use client";

import { signOut } from "../lib/auth";
import { BASE_PATH } from "../lib/basePath";
import { useSession } from "../lib/useSession";

/** Signed-in email and a sign-out button, for the dark page headers. */
export function AccountMenu({ size = "md" }: { size?: "sm" | "md" }) {
  const session = useSession();
  if (!session) return null;

  const handleSignOut = () => {
    signOut();
    // A full load drops everything held in memory, such as student records.
    window.location.replace(`${BASE_PATH}/login/`);
  };

  const button =
    size === "sm"
      ? "px-2.5 py-1 text-xs font-medium"
      : "px-3.5 py-2 text-sm font-semibold";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[16rem] truncate text-xs text-slate-300 md:inline" title={session.email}>
        {session.email}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        className={`rounded-md border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#FFB81C] ${button}`}
      >
        Sign out
      </button>
    </div>
  );
}
