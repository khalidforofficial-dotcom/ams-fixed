import "server-only";
import { asObject } from "./core";

export type LegacyMapped = { id: string; type: string; data: Record<string, unknown> };
export type KindReport = { found: number; imported: number; skipped: number; reasons: string[] };
export type LegacyReport = { records: LegacyMapped[]; report: Record<string, KindReport>; warnings: string[] };

const defaultTerms = new Set(["1st", "2nd", "3rd", "1st Term", "2nd Term", "3rd Term", "Annual", "Final"]);
const mobilePattern = /^01\d{9}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const str = (value: unknown) => value == null ? "" : String(value).trim();
const legacyId = (kind: string, value: unknown, index: number) => `legacy-${kind}-${str(value) || index + 1}`.replace(/[^a-zA-Z0-9_-]/g, "-");
const address = (value: unknown) => {
  const item = asObject(value);
  return [item.village, item.postOffice, item.upazila, item.district].map(str).filter(Boolean).join(", ");
};

function newReport(): KindReport { return { found: 0, imported: 0, skipped: 0, reasons: [] }; }
function skip(report: KindReport, reason: string) { report.skipped++; report.reasons.push(reason); }
function warnDefault(warnings: string[], label: string, field: string, value: unknown, fallback: string) {
  warnings.push(`${label}: invalid ${field} "${str(value)}"; defaulted to "${fallback}"`);
  return fallback;
}
function validDob(value: unknown, warnings: string[], label: string, teacher = false) {
  const text = str(value);
  const year = Number(text.slice(0, 4)), now = new Date().getFullYear();
  const ok = datePattern.test(text) && (teacher ? year >= now - 75 && year <= now - 18 : year >= now - 20 && year <= now);
  if (ok) return text;
  warnings.push(`${label}: ${text ? `dob "${text}" is outside the allowed range` : "dob is empty"}; left blank, please fill it in.`);
  return "";
}
function validMobile(value: unknown, warnings: string[], label: string, field: string) {
  const text = str(value);
  return !text || mobilePattern.test(text) ? text : warnDefault(warnings, label, field, value, "");
}
function array(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(asObject) : []; }

export function parseLegacyBackup(input: unknown): LegacyReport {
  const payload = asObject(asObject(input).ams_db_v1 || input);
  const records: LegacyMapped[] = [];
  const warnings: string[] = [];
  const report: Record<string, KindReport> = {};
  const section = (kind: string) => report[kind] ??= newReport();
  const studentMap = new Map<string, LegacyMapped>();
  const studentLookup: LegacyMapped[] = [];

  const students = array(payload.students);
  const studentReport = section("student"); studentReport.found = students.length;
  students.forEach((raw, index) => {
    const label = `Student ${str(raw.id) || index + 1}`;
    const classId = str(raw.className || raw.class || raw.classId) || warnDefault(warnings, label, "className", raw.className, "1");
    const admissionNo = str(raw.admissionNo) || `LEGACY-${String(index + 1).padStart(4, "0")}`;
    const nameEn = str(raw.nameEn); const nameBn = str(raw.nameBn);
    if (!nameEn && !nameBn) { skip(studentReport, `${label}: nameEn/nameBn is required`); return; }
    const father = asObject(raw.father), mother = asObject(raw.mother), guardian = asObject(raw.guardian), emergency = asObject(raw.emergency);
    const genderRaw = str(raw.gender).toLowerCase();
    const gender = ["male", "female", "other"].includes(genderRaw) ? genderRaw : warnDefault(warnings, label, "gender", raw.gender, "other");
    const id = legacyId("student", raw.id, index);
    const mapped: LegacyMapped = { id, type: "student", data: {
      legacyId: str(raw.id), admissionNo, classId, class: classId, roll: str(raw.roll) || String(index + 1), section: str(raw.section) || "A",
      nameEn: nameEn || nameBn, nameBn: nameBn || nameEn, gender, dob: validDob(raw.dob, warnings, label), bloodGroup: str(raw.bloodGroup), religion: str(raw.religion), nationality: str(raw.nationality) || "Bangladeshi",
      birthRegistrationNo: str(raw.birthRegNo), fatherName: str(father.name), fatherNid: str(father.nid), fatherMobile: validMobile(father.mobile, warnings, label, "father.mobile"), fatherOccupation: str(father.occupation),
      motherName: str(mother.name), motherNid: str(mother.nid), motherMobile: validMobile(mother.mobile, warnings, label, "mother.mobile"), motherOccupation: str(mother.occupation),
      guardianName: str(guardian.name), guardianRelation: str(guardian.relation), guardianMobile: validMobile(guardian.mobile, warnings, label, "guardian.mobile"),
      permanentAddress: address(raw.permanent), presentAddress: address(raw.present), address: address(raw.present) || address(raw.permanent), previousSchool: str(raw.prevSchool), previousClass: str(raw.prevClass), previousResult: str(raw.prevResult),
      height: str(raw.height), weight: str(raw.weight), eyesight: str(raw.eyesight), vaccines: Array.isArray(raw.vaccines) ? raw.vaccines : [], diseases: str(raw.diseases), emergencyName: str(emergency.name), emergencyRelation: str(emergency.relation), emergencyMobile: validMobile(emergency.mobile, warnings, label, "emergency.mobile"),
      admissionDate: datePattern.test(str(raw.admissionDate)) ? str(raw.admissionDate) : "", photo: str(raw.photo), status: "Active",
    }};
    records.push(mapped); studentLookup.push(mapped); studentMap.set(str(raw.id), mapped); studentReport.imported++;
  });

  const teachers = array(payload.teachers); const teacherReport = section("teacher"); teacherReport.found = teachers.length;
  teachers.forEach((raw, index) => {
    const label = `Teacher ${str(raw.id) || index + 1}`; const nameEn = str(raw["t-nameEn"] || raw.nameEn), nameBn = str(raw["t-nameBn"] || raw.nameBn);
    if (!nameEn && !nameBn) { skip(teacherReport, `${label}: t-nameEn/t-nameBn is required`); return; }
    const salaryRaw = Number(raw["t-salary"] ?? raw.salary ?? 0); const salary = Number.isFinite(salaryRaw) ? salaryRaw : 0;
    if (!Number.isFinite(Number(raw["t-salary"] ?? raw.salary ?? 0))) warnings.push(`${label}: invalid t-salary; defaulted to 0`);
    records.push({ id: legacyId("teacher", raw.id, index), type: "teacher", data: { legacyId: str(raw.id), nameEn: nameEn || nameBn, nameBn: nameBn || nameEn, designation: str(raw["t-desig"] || raw.designation), mobile: validMobile(raw["t-mobile"] || raw.mobile, warnings, label, "t-mobile"), joinDate: str(raw["t-join"] || raw.joinDate), salary, nid: str(raw["t-nid"]), subjects: str(raw["t-subs"]), qualification: str(raw["t-qual"]), dob: validDob(raw["t-dob"], warnings, label, true), addressEn: str(raw["t-address"]), photo: str(raw.photo), assignedClasses: [], status: "Active" } });
    teacherReport.imported++;
  });

  const configuredTerms = array(payload.examTerms).map((term) => str(term.name || term.title || term.id)).filter(Boolean);
  for (const term of configuredTerms) defaultTerms.add(term);
  const resultsObject = asObject(payload.results); const resultReport = section("result");
  for (const [compound, rollsRaw] of Object.entries(resultsObject)) {
    const [group, term = "", classId = ""] = compound.split("|");
    const rolls = asObject(rollsRaw);
    for (const [rollKey, subjectsRaw] of Object.entries(rolls)) {
      const subjects = asObject(subjectsRaw); resultReport.found += Object.keys(subjects).filter((key) => !key.startsWith("_")).length;
      const [roll, keySection] = rollKey.split(/[|:]/); const storedSection = str(keySection || subjects.section || subjects._section);
      const matches = studentLookup.filter((student) => str(student.data.classId) === classId && str(student.data.roll) === roll && (!storedSection || str(student.data.section) === storedSection));
      if (matches.length !== 1) {
        const reason = `Result ${compound}, roll ${roll}${storedSection ? `, section ${storedSection}` : ""}: ${matches.length ? "ambiguous student match" : "student not found"}`;
        const count = Object.keys(subjects).filter((key) => !key.startsWith("_")).length; resultReport.skipped += count; resultReport.reasons.push(reason); warnings.push(reason); continue;
      }
      if (!defaultTerms.has(term)) warnings.push(`Result ${compound}: custom exam term "${term}" imported; add it to exam terms settings`);
      Object.entries(subjects).filter(([subject]) => !subject.startsWith("_") && subject !== "section").forEach(([subject, marksRaw], subjectIndex) => {
        const marks = asObject(marksRaw); const continuous = Number(marks.c || 0), summative = Number(marks.s || 0), single = Number(marks.m || 0); const total = "m" in marks ? single : continuous + summative;
        if (!Number.isFinite(total)) { skip(resultReport, `Result ${compound}, roll ${roll}, subject ${subject}: marks are not numeric`); return; }
        const maximum = ["Arts & Crafts", "Physical Education", "Work Oriented Education"].includes(subject) ? 50 : 100;
        records.push({ id: legacyId("result", `${compound}-${matches[0].id}-${subject}`, subjectIndex), type: "result", data: { studentId: matches[0].id, classId, class: classId, classGroup: group, section: str(matches[0].data.section), term, subject, continuous, summative, total, max: maximum } }); resultReport.imported++;
      });
    }
  }

  const attendanceObject = asObject(payload.attendance); const attendanceReport = section("attendance");
  for (const [compound, valuesRaw] of Object.entries(attendanceObject)) {
    const [date, classId = ""] = compound.split("|");
    for (const [studentKey, statusRaw] of Object.entries(asObject(valuesRaw))) {
      attendanceReport.found++; const byId = studentMap.get(studentKey); const [roll, storedSection] = studentKey.split(/[|:]/); const matches = byId ? [byId] : studentLookup.filter((student) => str(student.data.classId) === classId && str(student.data.roll) === roll && (!storedSection || str(student.data.section) === storedSection));
      if (matches.length !== 1) { skip(attendanceReport, `Attendance ${compound}, ${studentKey}: ${matches.length ? "ambiguous student match" : "student not found"}`); continue; }
      const status = ({ P: "Present", A: "Absent", L: "Late", LV: "Leave" } as Record<string, string>)[str(statusRaw).toUpperCase()] || str(statusRaw);
      records.push({ id: legacyId("attendance", `${date}-${matches[0].id}`, attendanceReport.found), type: "attendance", data: { studentId: matches[0].id, classId, class: classId, section: matches[0].data.section, date, status } }); attendanceReport.imported++;
    }
  }

  const feeTypes = array(payload.feeTypes); const feeReport = section("feeType"); feeReport.found = feeTypes.length;
  feeTypes.forEach((raw, index) => { records.push({ id: legacyId("feeType", raw.id, index), type: "feeType", data: { legacyId: str(raw.id), name: str(raw.name), amount: Number(raw.amount || 0), appliesTo: raw.appliesTo, frequency: str(raw.frequency) } }); feeReport.imported++; });
  const payments = array(payload.payments); const paymentReport = section("payment"); paymentReport.found = payments.length;
  payments.forEach((raw, index) => { const student = studentMap.get(str(raw.studentId)); if (!student) { skip(paymentReport, `Payment ${str(raw.id) || index + 1}: studentId not found`); return; } records.push({ id: legacyId("payment", raw.id, index), type: "payment", data: { receiptNo: str(raw.receiptNo), studentId: student.id, feeTypeId: legacyId("feeType", raw.feeTypeId, index), feeTypeName: str(raw.feeTypeName), amount: Number(raw.amount || 0), discount: Number(raw.discount || 0), method: str(raw.method), date: str(raw.date), note: str(raw.note) } }); paymentReport.imported++; });

  const notices = array(payload.notices); notices.forEach((raw, index) => { const kind = str(raw.category).toLowerCase() === "holiday" ? "holiday" : "notice"; const itemReport = section(kind); itemReport.found++; records.push({ id: legacyId(kind, raw.id, index), type: kind, data: { title: str(raw.title), titleBn: str(raw.title), body: str(raw.body), date: str(raw.date), category: kind === "holiday" ? "Holiday" : str(raw.category) || "Notice" } }); itemReport.imported++; });
  const routines = array(payload.routine); const routineReport = section("routine"); routineReport.found = routines.length;
  routines.forEach((raw, index) => { records.push({ id: legacyId("routine", raw.id, index), type: "routine", data: { ...raw, classGroup: str(raw.group || raw.classGroup), group: undefined } }); routineReport.imported++; });

  const simple: [string, string][] = [["leaves", "leave"], ["leaveRequests", "leave"], ["questions", "submission"], ["papers", "submission"], ["marksSubs", "submission"], ["syllabus", "syllabus"]];
  for (const [source, kind] of simple) array(payload[source]).forEach((raw, index) => { const itemReport = section(kind); itemReport.found++; const category = source === "questions" ? "Question" : source === "papers" ? "Paper" : source === "marksSubs" ? "Marks" : undefined; records.push({ id: legacyId(kind, raw.id || `${source}-${index}`, records.length), type: kind, data: category ? { ...raw, category } : { ...raw } }); itemReport.imported++; });

  const settings = asObject(payload.settings); const safeSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "password"));
  if (Object.keys(safeSettings).length) { const configReport = section("config"); configReport.found = Object.keys(safeSettings).length; configReport.imported = configReport.found; records.push({ id: "legacy-config-settings", type: "config", data: { key: "legacySettings", value: { ...safeSettings, certificateSerial: settings.certSerial ?? settings.certificateSerial } } }); }
  return { records, report, warnings };
}
