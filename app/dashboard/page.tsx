import DashboardShell from "../components/dashboard/DashboardShell";

export const metadata = {
  title: "QU Bobcat Recruitment Intelligence",
  description:
    "F1 and J1 visa issuance analytics for Quinnipiac University international admissions.",
};

/** Same dashboard as `/`, kept so the `/dashboard` URL also resolves. */
export default function DashboardPage() {
  return <DashboardShell />;
}
