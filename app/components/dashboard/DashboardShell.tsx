"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { asset } from "../../lib/basePath";
import { loadDashboardData } from "../../lib/dashboard/data";
import type { DashboardData } from "../../lib/dashboard/types";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import Sidebar from "./Sidebar";
import HeaderKpis from "./HeaderKpis";
import { MethodologyNote } from "./ui";

import CommandCenterTab from "./tabs/CommandCenterTab";
import ExecutiveTab from "./tabs/ExecutiveTab";
import Country360Tab from "./tabs/Country360Tab";
import ConsulatesTab from "./tabs/ConsulatesTab";
import ResearchCountryTab from "./tabs/ResearchCountryTab";
import HistoricalTrendsTab from "./tabs/HistoricalTrendsTab";
import HistoricalConsulatesTab from "./tabs/HistoricalConsulatesTab";
import StrategyTab from "./tabs/StrategyTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import AiTab from "./tabs/AiTab";

/**
 * Tab order and labels are app.py's, verbatim. Note that the original pairs the
 * "Consulates" label with the Country Intelligence view and "Research: Country"
 * with Consulate Intelligence — those two labels are swapped relative to their
 * content upstream, and the pairing is preserved here rather than silently fixed.
 */
const TABS = [
  { id: "command", label: "Primary: Command", Component: CommandCenterTab },
  { id: "executive", label: "Executive", Component: ExecutiveTab },
  { id: "country360", label: "Country 360", Component: Country360Tab },
  { id: "consulates", label: "Consulates", Component: ConsulatesTab },
  { id: "research-country", label: "Research: Country", Component: ResearchCountryTab },
  { id: "historical-trends", label: "Historical Trends", Component: HistoricalTrendsTab },
  { id: "historical-consulates", label: "Historical Consulates", Component: HistoricalConsulatesTab },
  { id: "strategy", label: "Strategy", Component: StrategyTab },
  { id: "analytics", label: "Analytics", Component: AnalyticsTab },
  { id: "ai", label: "AI", Component: AiTab },
] as const;

function Header() {
  return (
    <header className="bg-[#0C2340] text-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4">
          <Image
            src={asset("/QUwhitebg.png")}
            alt="Quinnipiac University"
            width={1501}
            height={406}
            priority
            className="h-10 w-auto shrink-0"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Global Recruitment Intelligence
              <span className="text-[#FFB81C]">.</span>
            </h1>
            <p className="text-xs text-slate-300">
              Office of International Admissions · Quinnipiac University
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          <Link
            href="/transcript"
            className="rounded-md border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#FFB81C]"
          >
            View transcripts
          </Link>
          <Link
            href="/calculator"
            className="rounded-md bg-[#FFB81C] px-3.5 py-2 text-sm font-semibold text-[#0C2340] transition hover:bg-[#ffc74d] focus:outline-none focus:ring-2 focus:ring-white"
          >
            Create transcript
          </Link>
        </nav>
      </div>
      <div className="h-1 bg-[#FFB81C]" />
    </header>
  );
}

function Hero() {
  const { f1, allYears } = useDashboard();
  const countryCount = new Set(f1.map((r) => r.country)).size;
  const postCount = new Set(f1.map((r) => r.post)).size;

  return (
    <section className="mb-6 rounded-lg border border-[rgba(255,184,28,0.28)] bg-[linear-gradient(135deg,rgba(12,35,64,0.95),rgba(5,16,34,0.9))] p-6">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FFB81C]">
        Quinnipiac University · International Admissions Intelligence
      </div>
      <h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
        Bobcat Global Recruitment Intelligence
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        F1 · J1 visa issuance analytics across {countryCount} countries and {postCount} consulates ·{" "}
        {allYears.length > 0 ? `${Math.min(...allYears)}-${Math.max(...allYears)}` : "—"} data
      </p>
    </section>
  );
}

function DashboardBody() {
  const [active, setActive] = useState<string>(TABS[0].id);
  const ActiveTab = TABS.find((tab) => tab.id === active)?.Component ?? TABS[0].Component;

  return (
    <div className="min-h-screen bg-[#050F22] text-slate-200">
      <Header />

      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <Sidebar />

          <main className="min-w-0 flex-1">
            <Hero />
            <HeaderKpis />

            <div className="mb-2 overflow-x-auto">
              <div
                role="tablist"
                aria-label="Dashboard sections"
                className="flex min-w-max gap-1 border-b border-slate-400/20"
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={active === tab.id}
                    onClick={() => setActive(tab.id)}
                    className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                      active === tab.id
                        ? "border-[#FFB81C] text-white"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="mb-5 text-xs text-slate-500">
              Navigation grouping: first four tabs are primary decision-support views; remaining tabs
              are Research &amp; Legacy views retained for continuity.
            </p>

            <ActiveTab />

            <footer className="mt-10 border-t border-slate-400/15 pt-6 text-center text-xs text-slate-500">
              <MethodologyNote>
                Visa issuance volume reflects historical student mobility, not individual visa
                approval probability. 2025 data reflects available monthly records.
              </MethodologyNote>
              <div>
                QU Bobcat Global Recruitment Intelligence &nbsp;·&nbsp; Data: U.S. Department of
                State Visa Issuance Statistics &nbsp;·&nbsp; Built for Quinnipiac University
                International Admissions
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#050F22]">
      <Header />
      <div className="mx-auto max-w-[1600px] px-6 py-16 text-center text-slate-400">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#FFB81C]" />
        <p className="mt-4 text-sm">Loading recruitment intelligence…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#050F22]">
      <Header />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-6">
          <h2 className="text-lg font-bold text-rose-100">Dashboard data could not be loaded</h2>
          <p className="mt-2 text-sm text-rose-200">{message}</p>
          <p className="mt-4 text-xs text-rose-300/80">
            Check that <code className="font-mono">NEXT_PUBLIC_DASHBOARD_DATA_URL</code> points at
            the bucket holding the generated JSON, that the objects are readable, and that the
            bucket allows cross-origin GETs from this site. Locally, run{" "}
            <code className="font-mono">npm run dashboard:data</code> to populate{" "}
            <code className="font-mono">public/dashboard-data/</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardShell() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboardData()
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  return (
    <DashboardProvider data={data}>
      <DashboardBody />
    </DashboardProvider>
  );
}
