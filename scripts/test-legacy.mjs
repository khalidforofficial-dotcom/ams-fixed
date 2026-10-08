import fs from "node:fs/promises";
import process from "node:process";

const base = process.env.AMS_TEST_URL || "http://127.0.0.1:3000";
const fixture = JSON.parse(await fs.readFile(new URL("./legacy-fixture.json", import.meta.url), "utf8"));
const login = await fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "login", role: "admin", identifier: process.env.AMS_TEST_ADMIN || "admin@demo.ams", password: process.env.AMS_TEST_PASSWORD || "Demo@2026" }) });
if (!login.ok) throw new Error(`Admin login failed (${login.status}): ${await login.text()}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Login did not return a session cookie");
async function migrate(commit) {
  const response = await fetch(`${base}/api/migrate`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ payload: fixture, commit }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Migration failed (${response.status}): ${JSON.stringify(result)}`);
  return result;
}
function assertComplete(result, phase) {
  const required = { student: 3, teacher: 2, result: 6, holiday: 1 };
  for (const [kind, expected] of Object.entries(required)) {
    const actual = result.report?.[kind]?.imported;
    if (actual !== expected) throw new Error(`${phase}: expected ${expected} ${kind} records, got ${actual ?? "missing"}: ${JSON.stringify(result.report?.[kind])}`);
  }
  if (result.report.student.skipped || result.report.teacher.skipped || result.report.result.skipped) throw new Error(`${phase}: required records were skipped`);
}
async function list(kind, query = "") {
  const response = await fetch(`${base}/api/data/${kind}${query}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`Could not verify ${kind}: ${response.status} ${await response.text()}`);
  return (await response.json()).records;
}
const dryRun = await migrate(false); assertComplete(dryRun, "dry-run");
const commit = await migrate(true); assertComplete(commit, "commit");
const importedStudents = (await Promise.all(["old-s1", "old-s2", "old-s3"].map((id) => list("student", `?legacyId=${id}`)))).flat();
if (importedStudents.length !== 3) throw new Error(`commit verification: expected 3 stored students, got ${importedStudents.length}`);
const importedTeachers = (await Promise.all(["old-t1", "old-t2"].map((id) => list("teacher", `?legacyId=${id}`)))).flat();
if (importedTeachers.length !== 2 || importedTeachers.some((item) => !item.data.nameEn || Number(item.data.salary) <= 0)) throw new Error(`commit verification: teacher names or salaries missing: ${JSON.stringify(importedTeachers)}`);
const importedResults = (await Promise.all(["legacy-student-old-s1", "legacy-student-old-s2", "legacy-student-old-s3"].map((id) => list("result", `?studentId=${id}`)))).flat();
if (importedResults.length !== 6 || !importedResults.some((item) => item.data.term === "1st") || !importedResults.some((item) => item.data.term === "Monthly Assessment")) throw new Error(`commit verification: result terms or rows missing: ${JSON.stringify(importedResults)}`);
const holidays = await list("holiday", "?title=Independence%20Day");
if (holidays.length !== 1) throw new Error(`commit verification: imported holiday missing`);
console.log("Legacy fixture passed:", { students: importedStudents.length, teachers: importedTeachers.length, results: importedResults.length, holidays: holidays.length, warnings: commit.warnings.length });
