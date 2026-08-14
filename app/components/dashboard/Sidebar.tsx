"use client";

import { useDashboard } from "./DashboardContext";
import { MultiSelect, RadioGroup, Select, Slider } from "./ui";
import type { VisaSelection } from "../../lib/dashboard/types";

/** The Streamlit sidebar: year, visa class, focus country, comparisons, top-N. */
export default function Sidebar() {
  const {
    allYears,
    selectedYears,
    setSelectedYears,
    visaClass,
    setVisaClass,
    countries,
    focusCountry,
    setFocusCountry,
    compareCountries,
    setCompareCountries,
    topN,
    setTopN,
  } = useDashboard();

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <details
        open
        className="rounded-lg border border-slate-400/20 bg-[linear-gradient(180deg,rgba(14,37,76,0.92),rgba(5,16,34,0.88))] p-5 lg:sticky lg:top-6"
      >
        <summary className="cursor-pointer list-none text-center marker:hidden lg:cursor-default">
          <div className="font-serif text-2xl tracking-tight text-white">QU Bobcats</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FFB81C]">
            Global Recruitment Intelligence
          </div>
        </summary>

        <hr className="my-4 border-[rgba(255,184,28,0.25)]" />

        <div className="space-y-4">
          <div className="text-sm font-bold text-white">Filters</div>

          <MultiSelect
            label="Years"
            options={allYears.map(String)}
            values={selectedYears.map(String)}
            onChange={(values) => setSelectedYears(values.map(Number))}
            maxHeight={120}
          />

          <RadioGroup<VisaSelection>
            label="Visa Class"
            value={visaClass}
            options={["F1", "J1", "Both"]}
            onChange={setVisaClass}
          />

          <Select
            label="Focus Country"
            value={focusCountry}
            options={countries}
            onChange={setFocusCountry}
          />

          <MultiSelect
            label="Compare Countries"
            options={countries}
            values={compareCountries}
            onChange={setCompareCountries}
          />

          <Slider
            label="Top-N Markets"
            value={topN}
            min={10}
            max={50}
            step={5}
            onChange={setTopN}
          />
        </div>

        <hr className="my-4 border-white/10" />

        <p className="rounded-md border border-[rgba(61,141,222,0.3)] bg-[rgba(61,141,222,0.1)] p-3 text-xs leading-relaxed text-[#bfdcff]">
          Recruitment Command Center and Country 360 use page-specific controls in the main panel.
          The global filters above remain for legacy operational pages.
        </p>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Data: U.S. State Dept. Visa Issuances
          <br />
          Built for QU International Admissions
        </p>
      </details>
    </aside>
  );
}
