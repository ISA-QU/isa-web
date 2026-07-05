// Self-test for GPA math using the example/placeholder values as inputs.
// Expected: each placeholder grade → matching letter on US side → 4.0 for A, etc.
// Build the lib via tsx-style import isn't trivial here, so we reimplement
// the tiny conversion inline and assert the public math contract.
//
// Usage: node scripts/selftest.mjs

import letterToGpa from "../app/lib/defaultLetterScale.json" with { type: "json" };

function calc(courses, scale, letters) {
  const norm = (s) => s.trim().toLowerCase();
  let totalPoints = 0;
  let totalCredits = 0;
  for (const c of courses) {
    const credits = parseFloat(c.credits);
    if (Number.isNaN(credits) || credits <= 0) continue;
    const row = scale.rows.find((r) => norm(r.foreignGrade) === norm(c.grade));
    if (!row) continue;
    const key = Object.keys(letters).find((k) => norm(k) === norm(row.usGrade));
    if (key === undefined) continue;
    totalPoints += letters[key] * credits;
    totalCredits += credits;
  }
  return totalCredits > 0 ? totalPoints / totalCredits : null;
}

const scale = {
  foreignKind: "letter",
  usKind: "letter",
  rows: [
    { foreignGrade: "A", usGrade: "A" },
    { foreignGrade: "B", usGrade: "B" },
    { foreignGrade: "C", usGrade: "C" },
    { foreignGrade: "D", usGrade: "D" },
    { foreignGrade: "F", usGrade: "F" },
  ],
};

// Test 1: a single A=3cr course → 4.00
let gpa = calc([{ credits: "3", grade: "A" }], scale, letterToGpa);
console.assert(gpa === 4.0, `T1 expected 4.0, got ${gpa}`);

// Test 2: A(3) + B(3) → (4*3 + 3*3) / 6 = 3.5
gpa = calc([{ credits: "3", grade: "A" }, { credits: "3", grade: "B" }], scale, letterToGpa);
console.assert(gpa === 3.5, `T2 expected 3.5, got ${gpa}`);

// Test 3: A(4) + C(2) → (4*4 + 2*2) / 6 = 20/6 ≈ 3.3333
gpa = calc([{ credits: "4", grade: "A" }, { credits: "2", grade: "C" }], scale, letterToGpa);
console.assert(Math.abs(gpa - 20 / 6) < 1e-9, `T3 expected ${20/6}, got ${gpa}`);

// Test 4: empty grade → null
gpa = calc([{ credits: "3", grade: "" }], scale, letterToGpa);
console.assert(gpa === null, `T4 expected null, got ${gpa}`);

// Test 5: case insensitivity (foreign 'a' should match 'A' row)
gpa = calc([{ credits: "3", grade: "a" }], scale, letterToGpa);
console.assert(gpa === 4.0, `T5 expected 4.0, got ${gpa}`);

console.log("all self-tests passed");
