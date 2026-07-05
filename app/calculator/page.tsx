import { Suspense } from "react";
import CalculatorClient from "./CalculatorClient";

export default function CalculatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <CalculatorClient />
    </Suspense>
  );
}
