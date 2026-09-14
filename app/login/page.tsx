import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const metadata = {
  title: "Sign in — Office of International Admissions",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
