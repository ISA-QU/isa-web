import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { School, StudentInfo } from "./types";
import type { ConvertedCourse } from "./gpa";
import { formatGpa } from "./format";
import { asset } from "./basePath";

export interface SchoolReport {
  school: School;
  converted: ConvertedCourse[];
  gpa: number | null;
  totalCredits: number;
}

interface ReportData {
  student: StudentInfo;
  schools: SchoolReport[];
  cumulativeGpa: number | null;
  cumulativeCredits: number;
}

const NAVY: [number, number, number] = [15, 45, 82];
const GOLD: [number, number, number] = [241, 184, 45];

async function loadImageData(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastTableY = (doc: any): number => doc.lastAutoTable?.finalY ?? 0;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 14) {
    doc.addPage();
    return 20;
  }
  return y;
}

export async function downloadReport(data: ReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const logoData = await loadImageData(asset("/QUwhitebg.png"));

  // Navy header band with logo above title
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 32, pageWidth, 2, "F");

  const logoW = 50;
  const logoH = logoW * (406 / 1501);
  doc.addImage(logoData, "PNG", (pageWidth - logoW) / 2, 4, logoW, logoH);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text("Office of International Admissions — GPA Report", pageWidth / 2, 27, {
    align: "center",
  });

  // Student info: Name + QU ID on left; Generated + Calculated by on right
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  const studentStartY = 42;
  let y = studentStartY;
  const writeRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", 50, y);
    y += 6;
  };
  writeRow("Name", data.student.name);
  writeRow("QU ID", data.student.quId);

  // Right column: Generated, Calculated by
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generated: ${new Date().toLocaleDateString()}`,
    pageWidth - 14,
    studentStartY,
    { align: "right" },
  );
  doc.text(
    `Calculated by: ${data.student.calculatedBy || "—"}`,
    pageWidth - 14,
    studentStartY + 6,
    { align: "right" },
  );

  let cursorY = Math.max(y, studentStartY + 12) + 4;

  // Cumulative GPA highlight (early — most important number)
  doc.setFillColor(...GOLD);
  doc.rect(14, cursorY, pageWidth - 28, 12, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const cumText =
    data.cumulativeGpa !== null ? `${formatGpa(data.cumulativeGpa)}/4` : "—";
  doc.text(
    `Cumulative GPA: ${cumText}  ·  ${data.cumulativeCredits.toFixed(2)} credits  ·  ${data.schools.length} school${data.schools.length === 1 ? "" : "s"}`,
    pageWidth / 2,
    cursorY + 8,
    { align: "center" },
  );
  cursorY += 18;

  // Per-school sections
  for (let i = 0; i < data.schools.length; i++) {
    const sr = data.schools[i];

    cursorY = ensureSpace(doc, cursorY, 40);

    // School header
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const title = `${i + 1}. ${sr.school.name || "Untitled school"}${sr.school.country ? `  ·  ${sr.school.country}` : ""}`;
    doc.text(title, 14, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const schoolStatRight =
      sr.gpa !== null
        ? `School GPA: ${formatGpa(sr.gpa)}  ·  ${sr.totalCredits.toFixed(2)} credits`
        : "No GPA yet";
    doc.text(schoolStatRight, pageWidth - 14, cursorY, { align: "right" });

    cursorY += 4;

    // Courses table (sorted by semester)
    const sorted = [...sr.converted].sort((a, b) => {
      const sa = parseFloat(a.course.semester);
      const sb = parseFloat(b.course.semester);
      if (Number.isNaN(sa) && Number.isNaN(sb)) return 0;
      if (Number.isNaN(sa)) return 1;
      if (Number.isNaN(sb)) return -1;
      return sa - sb;
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Sem/Yr", "Course", "Credits", "Foreign", "US", "Pts"]],
      body: sorted.map((c) => [
        c.course.semester || "—",
        c.course.name || "—",
        c.course.credits || "—",
        c.course.grade || "—",
        c.usGrade ?? (c.error ?? "—"),
        c.gpaPoints !== null ? c.gpaPoints.toFixed(2) : "—",
      ]),
      headStyles: { fillColor: NAVY, textColor: 255 },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      margin: { left: 14, right: 14 },
    });

    cursorY = lastTableY(doc) + 6;
    cursorY = ensureSpace(doc, cursorY, 20);

    // Grading scale table (Foreign | US | Points)
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Grading scale used: ${sr.school.scale.name || "—"}`,
      14,
      cursorY,
    );

    const pointsFor = (usGrade: string): string => {
      const key = usGrade.trim().toUpperCase();
      const v = sr.school.letterToGpa[key];
      return v === undefined ? "—" : v.toFixed(2);
    };

    autoTable(doc, {
      startY: cursorY + 3,
      head: [["Foreign Grade", "US Grade", "GPA Points"]],
      body: sr.school.scale.rows.map((r) => [
        r.foreignGrade,
        r.usGrade,
        pointsFor(r.usGrade),
      ]),
      headStyles: { fillColor: NAVY, textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    cursorY = lastTableY(doc) + 10;
  }

  const filename = `gpa-report-${data.student.quId || data.student.name || "student"}.pdf`;
  doc.save(filename);
}
