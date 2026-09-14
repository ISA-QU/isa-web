"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "../lib/useSession";

const isLoginPath = (pathname: string) => pathname === "/login" || pathname.startsWith("/login/");

/**
 * Keeps every page except /login behind sign-in, sending signed-out visitors to
 * the login page and back again afterwards.
 *
 * This only hides screens. The security boundary is API Gateway's JWT
 * authorizer, which refuses API calls without a valid token (docs/login.md).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const onLoginPage = isLoginPath(pathname);
  const signedOut = session === null && !onLoginPage;

  useEffect(() => {
    if (!signedOut) return;
    const here = pathname + window.location.search;
    router.replace(`/login/?next=${encodeURIComponent(here)}`);
  }, [signedOut, pathname, router]);

  if (onLoginPage || session) return children;

  // Signed out, or storage not read yet (prerender and first hydration pass).
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0C2340]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#FFB81C]" />
    </div>
  );
}
