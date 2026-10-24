"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { AccountMenu } from "../AccountMenu";
import { asset } from "../../lib/basePath";
import { loadDashboardData } from "../../lib/dashboard/data";
import { monthLongDisplay } from "../../lib/dashboard/format";
import { periodFromParam, periodToParam } from "../../lib/dashboard/periods";
import { canonicalTab } from "../../lib/dashboard/url";
import { monthRangeLabel } from "../../lib/dashboard/rolling";
import type { DashboardData, VisaSelection } from "../../lib/dashboard/types";
import ControlBar from "./ControlBar";
import { TabNavigationContext, type OpenTab } from "./TabNavigation";
import { DashboardProvider, useDashboard, type InitialSelection } from "./DashboardContext";
import HeaderKpis from "./HeaderKpis";
import { MethodologyExpanders } from "./shared";

import MarketsTab from "./tabs/MarketsTab";
import ExecutiveTab from "./tabs/ExecutiveTab";
import Country360Tab from "./tabs/Country360Tab";
import ConsulatesPage from "./tabs/ConsulatesPage";
import HistoricalTrendsTab from "./tabs/HistoricalTrendsTab";

/**
 * Tab order is app.py's. app.py labelled the Country Intelligence view
 * "Consulates" and the Consulate Intelligence view "Research: Country"; the
 * labels now match their content.
 */
const TABS = [
  { id: "markets", label: "Markets", Component: MarketsTab },
  { id: "executive", label: "Executive", Component: ExecutiveTab },
  { id: "country-360", label: "Country 360", Component: Country360Tab },
  { id: "consulates", label: "Consulates", Component: ConsulatesPage },
  { id: "historical-trends", label: "Historical Trends", Component: HistoricalTrendsTab },
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
          <AccountMenu />
        </nav>
      </div>
      <div className="h-1 bg-[#FFB81C]" />
    </header>
  );
}

/** "(FY2026 covers Oct 2025 – Feb 2026 only)" when the latest fiscal year is partial. */
function partialFiscalYearNote(annual: DashboardData["meta"]["coverage"]["annual"]): string {
  const { latest, latestComplete, latestMonths } = annual;
  if (latest === null || latestMonths === null || latest === latestComplete) return "";
  // A fiscal year runs October of the previous year through September.
  const start = (latest - 1) * 12 + 9;
  return ` (FY${latest} covers ${monthRangeLabel({ start, end: start + latestMonths - 1 })} only)`;
}

function Hero() {
  const { data } = useDashboard();
  const { postsMonthly: postRange, annual, nationalityMonthly: nationalityRange } = data.meta.coverage;
  const { postCount, countryCount } = useMemo(
    () => ({
      postCount: new Set(data.postsMonthly.map((r) => r.post)).size,
      countryCount: new Set(data.postsMonthly.map((r) => r.country)).size,
    }),
    [data.postsMonthly],
  );

  return (
    <section className="mb-6 rounded-lg border border-[rgba(255,184,28,0.28)] bg-[linear-gradient(135deg,rgba(12,35,64,0.95),rgba(5,16,34,0.9))] p-6">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#FFB81C]">
        Quinnipiac University · International Admissions Intelligence
      </div>
      <h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
        Bobcat Global Recruitment Intelligence
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        F1 · J1 visa issuances · <b className="text-slate-100">By consulate:</b> {postCount}{" "}
        consulates in {countryCount} countries, monthly, {monthRangeLabel(postRange)}
        {annual.first !== null && annual.latest !== null && (
          <>
            {" "}
            · <b className="text-slate-100">By nationality:</b>{" "}
            {nationalityRange && data.nationalityMonthly ? `monthly, ${monthRangeLabel(nationalityRange)}; ` : ""}
            annual, FY{annual.first} – FY{annual.latest}
            {partialFiscalYearNote(annual)}
          </>
        )}
      </p>
    </section>
  );
}

/* ---- Web address: country, visa and tab, so a view can be shared and survives a reload ---- */

const VISA_PARAM: Record<VisaSelection, string> = { F1: "f1", J1: "j1", Both: "both" };

interface UrlSelection extends InitialSelection {
  tab?: string;
}

/** Reads the selection from the address. Unknown or missing values fall back to defaults. */
function readUrlSelection(): UrlSelection {
  const params = new URLSearchParams(window.location.search);
  const period = periodFromParam(params.get("period")) ?? undefined;
  const visaParam = params.get("visa")?.toLowerCase();
  const visa = (Object.keys(VISA_PARAM) as VisaSelection[]).find((v) => VISA_PARAM[v] === visaParam);
  // Old tab names (pages merged into Consulates in 8-1) still open the right page.
  const tab = canonicalTab(params.get("tab"), TABS.map((t) => t.id));
  return {
    country: params.get("country") ?? undefined,
    visa,
    period,
    tab,
    showEvents: params.get("events")?.toLowerCase() !== "off",
  };
}

/** Writes the selection into the address without adding browser-history entries. */
function useUrlSync(country: string, visa: VisaSelection, period: string, tab: string, showEvents: boolean) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("country", country);
    params.set("visa", VISA_PARAM[visa]);
    params.set("period", period);
    params.set("tab", tab);
    // Events are on by default, so only "off" is written.
    if (showEvents) params.delete("events");
    else params.set("events", "off");
    // The Consulates page's own settings only belong in its address.
    if (tab !== "consulates") {
      params.delete("consulate");
      params.delete("scope");
    }
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [country, visa, period, tab, showEvents]);
}

function DashboardBody({ initialTab }: { initialTab?: string }) {
  const { data, focusCountry, visa, period, showEvents } = useDashboard();
  const [active, setActive] = useState<string>(initialTab ?? TABS[0].id);
  const ActiveTab = TABS.find((tab) => tab.id === active)?.Component ?? TABS[0].Component;
  useUrlSync(focusCountry, visa, periodToParam(period), active, showEvents);

  // Lets a page open another tab with that tab's own address settings, e.g.
  // Country 360's "See all consulates" link opens Consulates with scope=country.
  const openTab: OpenTab = (tab, params) => {
    if (params) {
      const search = new URLSearchParams(window.location.search);
      search.delete("consulate");
      for (const [key, value] of Object.entries(params)) search.set(key, value);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${search.toString()}`);
    }
    setActive(tab);
    window.scrollTo({ top: 0 });
  };

  // Tabs: arrow keys move between them, Home/End jump to the ends.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="min-h-screen bg-[#050F22] text-slate-200">
      <Header />

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <ControlBar fiscalYearMode={active === "historical-trends"} />
        <main className="min-w-0">
          <Hero />
          <HeaderKpis />

          <div className="mb-5 overflow-x-auto">
            <div
              role="tablist"
              aria-label="Dashboard sections"
              className="flex min-w-max gap-1 border-b border-slate-400/20"
            >
              {TABS.map((tab, index) => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  role="tab"
                  type="button"
                  aria-selected={active === tab.id}
                  aria-controls="dashboard-tabpanel"
                  tabIndex={active === tab.id ? 0 : -1}
                  onClick={() => setActive(tab.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB81C] ${
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

          <div id="dashboard-tabpanel" role="tabpanel" aria-labelledby={`tab-${active}`}>
            <TabNavigationContext.Provider value={openTab}>
              <ActiveTab />
            </TabNavigationContext.Provider>
          </div>

          {/* The methodology, once for every tab. */}
          <div className="mt-10">
            <MethodologyExpanders includeMarket />
          </div>

          <footer className="mt-6 border-t border-slate-400/15 pt-4 text-center text-xs text-slate-500">
            Data: U.S. Department of State visa issuance statistics, monthly through{" "}
            {monthLongDisplay(data.meta.coverage.postsMonthly.end)} · Built for Quinnipiac University
            International Admissions
          </footer>
        </main>
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
            Check that the <code className="font-mono">GET /dashboard</code> route is deployed,
            that its CORS settings allow this site, and that the rebuild-dashboard Lambda has
            written a snapshot. Locally, run{" "}
            <code className="font-mono">npm run dashboard:data</code> and set{" "}
            <code className="font-mono">NEXT_PUBLIC_DASHBOARD_DATA_URL</code> in{" "}
            <code className="font-mono">.env.development.local</code> to{" "}
            <code className="font-mono">/isa-web/dashboard-data/snapshot.json</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardShell() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<UrlSelection>({});

  useEffect(() => {
    let cancelled = false;
    loadDashboardData()
      .then((loaded) => {
        if (cancelled) return;
        // Read the address once, in the browser, before the dashboard first renders.
        setSelection(readUrlSelection());
        setData(loaded);
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
    <DashboardProvider data={data} initial={selection}>
      <DashboardBody initialTab={selection.tab} />
    </DashboardProvider>
  );
}
