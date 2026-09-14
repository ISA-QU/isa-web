"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";

import {
  AuthError,
  completeNewPassword,
  confirmForgotPassword,
  forgotPassword,
  isAuthConfigured,
  signIn,
} from "../lib/auth";
import { asset } from "../lib/basePath";
import { useSession } from "../lib/useSession";

type Step = "signIn" | "newPassword" | "forgot" | "reset";

const PASSWORD_RULES =
  "At least 8 characters, with an upper-case letter, a lower-case letter, a number and a symbol.";

const COPY: Record<Step, { title: string; subtitle: string; submit: string }> = {
  signIn: {
    title: "Sign in",
    subtitle: "Staff access only. Accounts are created by the admissions office.",
    submit: "Sign in",
  },
  newPassword: {
    title: "Choose your password",
    subtitle: "You signed in with a temporary password. Pick your own to continue.",
    submit: "Set password and continue",
  },
  forgot: {
    title: "Reset your password",
    subtitle: "Enter your email and we'll send you a reset code.",
    submit: "Send reset code",
  },
  reset: {
    title: "Enter your reset code",
    subtitle: "Use the code from the email and choose a new password.",
    submit: "Change password",
  },
};

/** Same-site paths only, so the `next` parameter can't send anyone elsewhere. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function Field({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        {...input}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[#0F2D52] focus:outline-none focus:ring-2 focus:ring-[#0F2D52]/20"
      />
    </label>
  );
}

export default function LoginClient() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const session = useSession();

  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeSession, setChallengeSession] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in — already, or just now — so carry on to where the user was headed.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);

  const goTo = (target: Step, message: string | null = null) => {
    setStep(target);
    setError(null);
    setNotice(message);
    setNewPassword("");
    setConfirmPassword("");
    setCode("");
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();

    if ((step === "newPassword" || step === "reset") && newPassword !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    if (step === "signIn") {
      void run(async () => {
        const result = await signIn(address, password);
        if (result.status === "newPasswordRequired") {
          setChallengeSession(result.challengeSession);
          setPassword("");
          goTo("newPassword");
        }
      });
    } else if (step === "newPassword") {
      void run(() => completeNewPassword(address, newPassword, challengeSession));
    } else if (step === "forgot") {
      void run(async () => {
        await forgotPassword(address);
        goTo("reset", `If ${address} has an account, a reset code is on its way to that inbox.`);
      });
    } else {
      void run(async () => {
        await confirmForgotPassword(address, code.trim(), newPassword);
        setPassword("");
        goTo("signIn", "Password changed. Sign in with your new password.");
      });
    }
  };

  const copy = COPY[step];
  const linkCls = "font-medium text-[#0F2D52] hover:underline";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-[#0F2D52] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-5">
          <div className="text-xl font-bold tracking-tight sm:text-2xl">
            Office of International Admissions
            <span className="text-[#F1B82D]">.</span>
          </div>
          <Image
            src={asset("/QUwhitebg.png")}
            alt="Quinnipiac University"
            width={1501}
            height={406}
            priority
            className="h-10 w-auto shrink-0 sm:h-12"
          />
        </div>
        <div className="h-1 bg-[#F1B82D]" />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-16">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold text-[#0F2D52]">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>

          {!isAuthConfigured && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Sign-in isn&apos;t set up yet: the Cognito app client ID is missing from the site&apos;s
              configuration.
            </div>
          )}
          {notice && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            {(step === "signIn" || step === "forgot") && (
              <Field
                label="Email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            {(step === "newPassword" || step === "reset") && (
              <p className="text-sm text-slate-600">
                Account: <span className="font-medium text-slate-800">{email.trim()}</span>
              </p>
            )}
            {step === "signIn" && (
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {step === "reset" && (
              <Field
                label="Reset code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
            {(step === "newPassword" || step === "reset") && (
              <>
                <Field
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  autoFocus={step === "newPassword"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Field
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <p className="text-xs text-slate-500">{PASSWORD_RULES}</p>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !isAuthConfigured}
            className="mt-6 w-full rounded-md bg-[#0F2D52] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B3F6D] focus:outline-none focus:ring-2 focus:ring-[#F1B82D] disabled:opacity-50"
          >
            {busy ? "Please wait…" : copy.submit}
          </button>

          <div className="mt-4 flex justify-center gap-4 text-sm">
            {step === "signIn" ? (
              <button type="button" onClick={() => goTo("forgot")} className={linkCls}>
                Forgot password?
              </button>
            ) : (
              <button type="button" onClick={() => goTo("signIn")} className={linkCls}>
                Back to sign in
              </button>
            )}
            {step === "reset" && (
              <button type="button" onClick={() => goTo("forgot")} className={linkCls}>
                Send a new code
              </button>
            )}
          </div>
        </form>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-slate-400">
        Office of International Admissions · Quinnipiac University
      </footer>
    </div>
  );
}
