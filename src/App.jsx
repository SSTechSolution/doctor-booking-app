import React, { useEffect, useMemo, useState } from "react";
import "./App.css"
/**
 * Doctor Appointment Booking – React Demo (v3)
 * Aligns with Flow Spec (v2) + hosp color theme + MRN requirement
 *
 * Highlights
 * - Dept & Doctor on the same page (either can be selected first)
 * - Doctor can belong to multiple departments (doctorId unique)
 * - Selecting a doctor auto-selects one of their departments; chips let you switch
 * - Full MONTH calendar with Month/Year selectors; non-available days disabled
 * - Distinct states: Available / Few left / Full / Not available
 * - Selections persist across steps (and can optionally persist in sessionStorage)
 * - OTP demo (use code 123456)
 * - Existing vs New patient with CAPTCHA and Consent
 * - **MRN** used everywhere (10 digits, starts with 1)
 * - hosp-inspired theme via CSS variables
 *
 * How to run (Vite):
 *   npm create vite@latest hosp-appointment -- --template react
 *   cd hosp-appointment && npm install
 *   Replace src/App.jsx with this file’s default export (or import and render it)
 *   npm run dev
 */

// ---------- THEME (RF Hospital inspired) ----------
// Note: Adjust these to match the exact site tokens if needed.
// const THEME = `
// :root{
//   --hosp-primary:#00A652; /* green */
//   --hosp-accent:#D7B46A;  /* gold  */
//   --hosp-text:#0B0F10;
//   --hosp-muted:#6B7280;
//   --hosp-surface:#F7FAF7;
// }
// .hosp-link{ color:var(--hosp-primary); text-decoration:underline; }
// .hosp-ring{ outline:2px solid var(--hosp-primary); outline-offset:1px; }
// .hosp-card{ border:1px solid #e5e7eb; border-radius:0.75rem; padding:0.75rem; background:#fff; }
// .hosp-chip{ display:inline-flex; align-items:center; gap:0.25rem; font-size:0.75rem; padding:0.15rem 0.5rem; border-radius:999px; border:1px solid color-mix(in srgb, var(--hosp-accent) 55%, transparent); background:color-mix(in srgb, var(--hosp-accent) 18%, transparent); color:#7a5d23; }
// .hosp-btn{ padding:0.5rem 0.9rem; border-radius:0.6rem; font-size:0.9rem; font-weight:600; }
// .hosp-btn-primary{ background:var(--hosp-primary); color:#fff; border:1px solid var(--hosp-primary); }
// .hosp-btn-primary:disabled{ opacity:.5; cursor:not-allowed; }
// .hosp-btn-outline{ background:#fff; color:var(--hosp-text); border:1px solid #d1d5db; }
// `;

// -------------- Utilities --------------
const today = new Date();
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const MRN_REGEX = /^1\d{9}$/; // 10 digits, starts with 1

// -------------- Sample Test Data (reusable) --------------
export const SAMPLE = {
  departments: [
    { id: "gm", name: "General Medicine" },
    { id: "card", name: "Cardiology" },
    { id: "ortho", name: "Orthopaedics" },
    { id: "obg", name: "OB-GYN" },
    { id: "ped", name: "Paediatrics" },
    { id: "derm", name: "Dermatology" },
    { id: "ent", name: "ENT" },
  ],
  doctors: [
    { id: "d1", name: "Dr. A. Sharma", depts: ["card", "gm"], exp: 15, langs: ["EN", "HI"], location: "OPD-2F", consult: "In-person" },
    { id: "d2", name: "Dr. R. Mehta", depts: ["gm"], exp: 10, langs: ["EN", "HI"], location: "OPD-1F", consult: "In-person" },
    { id: "d3", name: "Dr. S. Iyer", depts: ["derm", "ent"], exp: 12, langs: ["EN", "HI", "MR"], location: "OPD-3F", consult: "In-person" },
  ],
  patientsByPhone: {
    "+919876543210": [
      { id: "p1", mrn: "1000000123", firstName: "Jane", lastName: "Doe", dob: "1990-05-12", gender: "Female", phone: "+919876543210", email: "jane@example.com" },
      { id: "p2", mrn: "1000000456", firstName: "Rohan", lastName: "Doe", dob: "2016-03-04", gender: "Male", phone: "+919876543210", email: "guardian@example.com" },
    ],
    "+911234567890": [],
  },
  otpCode: "123456",
};

// Availability map: doctorId -> dateISO -> slots[] {time, status:'available'|'few'|'full'}
function generateMockAvailability(doctors) {
  const avail = {};
  for (const doc of doctors) {
    avail[doc.id] = {};
    for (let i = 0; i < 60; i++) { // next ~2 months
      const d = addDays(today, i);
      const weekday = d.getDay(); // 0..6
      let working = true;
      if (doc.id === "d3" && (weekday === 0 || weekday === 6)) working = false; // weekends off
      if (doc.id === "d1" && weekday === 3) working = false; // Wed off
      if (doc.id === "d2" && weekday === 2) working = false; // Tue off
      if (!working) continue;

      const iso = toISO(d);
      const times = ["10:00", "10:20", "10:40", "11:00", "11:20", "11:40", "12:00", "12:20", "12:40"];
      const daySlots = times.map((t, idx) => {
        if (i % 5 === 0 && idx < 3) return { time: t, status: "full" };
        if (i % 3 === 0 && idx === times.length - 1) return { time: t, status: "few" };
        return { time: t, status: "available" };
      });
      if (i === 1 && doc.id === "d1") daySlots.forEach(s => s.status = "full");
      if (i === 2 && doc.id === "d2") daySlots.forEach(s => s.status = "full");
      avail[doc.id][iso] = daySlots;
    }
  }
  return avail;
}

// Build demo stores
const DEPARTMENTS = SAMPLE.departments;
const DOCTORS = SAMPLE.doctors;
const MOCK_AVAIL = generateMockAvailability(DOCTORS);
const MOCK_PATIENTS_BY_PHONE = JSON.parse(JSON.stringify(SAMPLE.patientsByPhone));
const BOOKINGS = new Map(); // `${doctorId}|${date}|${time}` -> {appointmentId, phone, patientId}

// -------------- Mock service layer --------------
let otpSendCounts = {}; // naive per-session counter
function mockSendOtp(phone) {
  otpSendCounts[phone] = (otpSendCounts[phone] || 0) + 1;
  const tooMany = otpSendCounts[phone] > 5;
  return new Promise((resolve, reject) => setTimeout(() => tooMany ? reject(new Error("Rate limited. Try again later.")) : resolve({ txnId: Math.random().toString(36).slice(2), cooldown: 30 }), 500));
}
function mockVerifyOtp(_txnId, code) {
  return new Promise((resolve, reject) => setTimeout(() => code === SAMPLE.otpCode ? resolve({ verified: true }) : reject(new Error("Incorrect OTP")), 400));
}
function mockGetPatientsByPhone(phone) { return new Promise((r) => setTimeout(() => r(MOCK_PATIENTS_BY_PHONE[phone] || []), 400)); }
function mockCreatePatient(profile) {
  return new Promise((resolve, reject) => setTimeout(() => {
    const { firstName, lastName, phone, dob, gender } = profile || {};
    if (!firstName || !lastName || !phone || !dob || !gender) return reject(new Error("Missing required fields"));
    // MRN: 10 digits starting with 1
    let mrn = "1" + Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
    if (!MRN_REGEX.test(mrn)) mrn = "1000000001"; // fallback
    const id = "p" + Math.random().toString(36).slice(2, 8);
    const created = { id, mrn, ...profile };
    MOCK_PATIENTS_BY_PHONE[phone] = (MOCK_PATIENTS_BY_PHONE[phone] || []).concat(created);
    resolve(created);
  }, 600));
}
function slotKey(doctorId, dateISO, time) { return `${doctorId}|${dateISO}|${time}`; }
function mockCreateAppointment({ doctorId, dateISO, time, phone, patientId }) {
  return new Promise((resolve, reject) => setTimeout(() => {
    const key = slotKey(doctorId, dateISO, time);
    if (BOOKINGS.has(key)) {
      // suggest alternatives
      const alternatives = [];
      const same = (MOCK_AVAIL[doctorId][dateISO] || []).filter(s => s.status !== "full");
      for (const s of same) {
        if (!BOOKINGS.has(slotKey(doctorId, dateISO, s.time)) && s.time !== time) { alternatives.push({ dateISO, time: s.time }); if (alternatives.length >= 3) break; }
      }
      for (let i = 1; alternatives.length < 3 && i < 7; i++) {
        const d2 = toISO(addDays(new Date(dateISO), i));
        const arr = (MOCK_AVAIL[doctorId][d2] || []).filter(s => s.status !== "full");
        for (const s of arr) {
          if (!BOOKINGS.has(slotKey(doctorId, d2, s.time))) { alternatives.push({ dateISO: d2, time: s.time }); if (alternatives.length >= 3) break; }
        }
      }
      return reject(Object.assign(new Error("Slot just got booked"), { alternatives }));
    }
    const appointmentId = "A" + Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0");
    BOOKINGS.set(key, { appointmentId, phone, patientId });
    resolve({ appointmentId });
  }, 800));
}

// -------------- UI Atoms --------------
function Stepper({ step }) {
  const items = ["Select", "Slot", "OTP", "Patient", "Review", "Done"];
  
  return (
    <div className="stepper">
      {items.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`step-item ${i < step ? "completed" : ""} ${i === step ? "active" : ""}`}>
            <div className="step-number">{i + 1}</div>
            <div className="step-label">{label}</div>
          </div>
          {i < items.length - 1 && <div className="step-connector" />}
        </React.Fragment>
      ))}
    </div>
  );
}
function Badge({ children }) { return <span className="hosp-chip">{children}</span>; }
function DepartmentName({ id }) { return <>{DEPARTMENTS.find((d) => d.id === id)?.name || "—"}</>; }
function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs" aria-label="Legend">
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Slots available</div>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-500" /> Few left</div>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Full</div>
      <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-gray-300" /> Not available</div>
    </div>
  );
}

// -------------- Month Calendar --------------
function MonthCalendar({ doctorId, selectedDateISO, onSelectDate }) {
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  // Keep month/year in sync when a specific date is chosen elsewhere
  useEffect(() => {
    if (selectedDateISO) { const d = new Date(selectedDateISO); setMonth(d.getMonth()); setYear(d.getFullYear()); }
  }, [selectedDateISO]);

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const totalDays = daysInMonth(year, month);
  const cells = [];
  // build 6x7 grid
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startWeekday + 1;
    const valid = dayNum > 0 && dayNum <= totalDays;
    cells.push(valid ? new Date(year, month, dayNum) : null);
  }

  const years = [year - 1, year, year + 1];
  const monthNames = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }));

  function prevMonth() { setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; }); }

  function dayState(d) {
    const iso = toISO(d);
    const daySlots = (MOCK_AVAIL[doctorId] || {})[iso] || null;
    if (!daySlots) return { state: "na", label: "Not available" };
    const unbooked = daySlots.filter((s) => s.status !== "full").filter((s) => !BOOKINGS.has(slotKey(doctorId, iso, s.time)));
    if (unbooked.length === 0) return { state: "full", label: "Full" };
    const few = unbooked.length <= 2;
    return { state: few ? "few" : "avail", label: few ? "Few left" : "Slots available" };
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="hosp-btn hosp-btn-outline" onClick={prevMonth}>{"<"}</button>
        <select className="border rounded-lg p-2" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthNames.map((m, i) => (<option key={m} value={i}>{m}</option>))}
        </select>
        <select className="border rounded-lg p-2" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        <button className="hosp-btn hosp-btn-outline" onClick={nextMonth}>{">"}</button>
        <button className="hosp-btn hosp-btn-outline" onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}>Today</button>
      </div>

      <div className="grid grid-cols-7 text-xs text-gray-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="p-1 text-center">{d}</div>)}
      </div>

     <div className="calendar-grid">
  {cells.map((d, idx) => {
    if (!d) return <div key={idx} className="calendar-day disabled" />;
    
    const iso = toISO(d);
    const { state, label } = dayState(d);
    const disabled = state === "na";
    const selected = selectedDateISO === iso;
    
    return (
      <button
        key={iso}
        onClick={() => !disabled && onSelectDate(iso)}
        disabled={disabled}
        className={`calendar-day ${selected ? "selected" : ""} ${
          state === "avail" ? "calendar-day-avail" : 
          state === "few" ? "calendar-day-few" : 
          state === "full" ? "calendar-day-full" : ""
        } ${disabled ? "disabled" : ""}`}
        aria-disabled={disabled}
        aria-label={`${d.toDateString()} ${label}`}
      >
        <div className="day-number">{d.getDate()}</div>
        <div className="day-status">{label}</div>
      </button>
    );
  })}
</div>

    </div>
  );
}

function Slots({ doctorId, dateISO, selectedTime, onSelectTime }) {
  const slots = (MOCK_AVAIL[doctorId] || {})[dateISO] || [];
  if (!slots.length) return <div className="text-sm text-gray-600">No slots for this date.</div>;
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Time slots">
      {slots.map((s) => {
        const disabled = s.status === "full" || BOOKINGS.has(slotKey(doctorId, dateISO, s.time));
        const few = s.status === "few";
        return (
          <button key={s.time} onClick={() => !disabled && onSelectTime(s.time)} disabled={disabled}
            className={`px-3 py-2 rounded-lg border text-sm ${selectedTime === s.time ? "hosp-ring" : ""} ${disabled ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-white"}`} aria-disabled={disabled}>
            <div className="font-medium">{s.time}</div>
            <div className="text-[10px] mt-0.5">{disabled ? "Full" : (few ? "Few left" : "Available")}</div>
          </button>
        );
      })}
    </div>
  );
}

// -------------- Main Demo --------------
export default function AppointmentBookingDemo() {
  const [step, setStep] = useState(0);

  // selections
  const [deptId, setDeptId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState("");

  // slot hold
  const [holdExpiry, setHoldExpiry] = useState(null);
  useEffect(() => {
    if (time && dateISO && doctorId) {
      const expiry = Date.now() + 5 * 60 * 1000; setHoldExpiry(expiry);
      const i = setInterval(() => { if (Date.now() > expiry) { setTime(""); setHoldExpiry(null); } }, 1000);
      return () => clearInterval(i);
    }
  }, [time, dateISO, doctorId]);
  const holdRemaining = holdExpiry ? Math.max(0, Math.floor((holdExpiry - Date.now()) / 1000)) : 0;

  // OTP
  const [phone, setPhone] = useState("+91");
  const [otpTxn, setOtpTxn] = useState("");
  const [otpStatus, setOtpStatus] = useState("idle"); // idle|sent|verified
  const [otpError, setOtpError] = useState("");

  // patients
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const selectedPatient = useMemo(() => patients.find((p) => p.id === selectedPatientId) || null, [patients, selectedPatientId]);

  // new patient form
  const [newP, setNewP] = useState({ firstName: "", lastName: "", phone: "", email: "", dob: "", gender: "" });
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [consent, setConsent] = useState(false);

  // confirmation
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState(null); // {appointmentId, mrn, patientName}

  const selectedDoctor = DOCTORS.find((d) => d.id === doctorId) || null;
  const selectedDept = DEPARTMENTS.find((d) => d.id === deptId) || null;

  // filter doctors by department (if chosen)
  const filteredDoctors = useMemo(() => (!deptId ? DOCTORS : DOCTORS.filter((d) => d.depts.includes(deptId))), [deptId]);

  // when selecting a doctor, auto-pick a department they belong to (if none chosen or mismatch)
  useEffect(() => {
    if (!doctorId) return;
    const doc = DOCTORS.find((d) => d.id === doctorId);
    if (doc && (!deptId || !doc.depts.includes(deptId))) setDeptId(doc.depts[0]);
  }, [doctorId]);

  // guards
  const canContinueFromSelect = !!doctorId;
  const canContinueFromSlot = !!(dateISO && time);
  const canContinueFromOtp = otpStatus === "verified";
  const canContinueFromPatient = !!selectedPatientId || (newP.firstName && newP.lastName && newP.phone && newP.email && newP.dob && newP.gender && consent && captchaChecked);

  function resetFrom(stepIdx) {
    if (stepIdx <= 1) { setDateISO(""); setTime(""); setHoldExpiry(null); }
    if (stepIdx <= 2) { setOtpStatus("idle"); setOtpTxn(""); setPatients([]); setSelectedPatientId(""); }
    if (stepIdx <= 3) { setNewP({ firstName: "", lastName: "", phone: "", email: "", dob: "", gender: "" }); setConsent(false); setCaptchaChecked(false); }
    if (stepIdx <= 4) { setConfirmation(null); }
    setStep(stepIdx);
  }

  // OTP actions
  async function sendOtp() { setOtpError(""); try { const { txnId } = await mockSendOtp(phone); setOtpTxn(txnId); setOtpStatus("sent"); } catch (e) { setOtpError(e.message); } }
  async function verifyOtp(code) { setOtpError(""); try { await mockVerifyOtp(otpTxn, code); setOtpStatus("verified"); const res = await mockGetPatientsByPhone(phone); setPatients(res); if (res[0]) setSelectedPatientId(res[0].id); } catch (e) { setOtpError(e.message); } }
  async function createNewPatient() { const p = await mockCreatePatient({ ...newP, phone }); setPatients((prev) => prev.concat(p)); setSelectedPatientId(p.id); }

  async function submitBooking() {
    if (!selectedDoctor || !dateISO || !time) return;
    setConfirming(true);
    try {
      const patientId = selectedPatientId;
      const res = await mockCreateAppointment({ doctorId: selectedDoctor.id, dateISO, time, phone, patientId });
      const mrn = selectedPatient?.mrn || (MOCK_PATIENTS_BY_PHONE[phone]?.find((p) => p.id === patientId)?.mrn) || "1000000001";
      const patientName = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : `${newP.firstName} ${newP.lastName}`;
      setConfirmation({ appointmentId: res.appointmentId, mrn, patientName });
      setStep(5);
    } catch (e) {
      alert(`That slot was just taken. Suggested alternatives:\n${(e.alternatives || []).map((a) => `${a.dateISO} ${a.time}`).join("\n") || "Please pick another"}`);
    } finally { setConfirming(false); }
  }

  return (
    <div className="app-container text-sm">
      {/* <style>{THEME}</style> */}
      <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--hosp-primary)' }}>Book a Doctor's Appointment</h1>
      <p className="text-gray-600 mb-4">Doctor & Department on one page · Monthly calendar with month/year selectors · Disabled non-available dates · Clear slot states.</p>

      <Stepper step={step} />

      {/* Step 0: Select Department & Doctor */}
      {step === 0 && (
        <section className="space-y-4">
          <div className="hosp-card">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Choose Department & Doctor</h2>
              {(deptId || doctorId) && (
                <div className="flex items-center gap-2 text-xs">
                  {deptId && <Badge><DepartmentName id={deptId} /></Badge>}
                  {doctorId && <Badge>{DOCTORS.find((d) => d.id === doctorId)?.name}</Badge>}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-3">
              <label className="block">
                <span className="block text-sm font-medium">Department</span>
                <select className="mt-1 w-full border rounded-lg p-2" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">All departments</option>
                  {DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <div className="text-xs text-gray-500 mt-1">Pick a department to filter doctors. Or pick a doctor first.</div>
              </label>

              <label className="block">
                <span className="block text-sm font-medium">Doctor</span>
                <select className="mt-1 w-full border rounded-lg p-2" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">Select a doctor</option>
                  {filteredDoctors.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                </select>
                {doctorId && (
                  <div className="text-xs text-gray-600 mt-1">Departments: {DOCTORS.find((d) => d.id === doctorId)?.depts.map((did) => <span key={did} className="ml-1">• <DepartmentName id={did} /></span>)}</div>
                )}
              </label>
            </div>

            {doctorId && (
              <div className="mt-3">
                <div className="text-xs text-gray-600 mb-1">Doctor belongs to multiple departments. Choose one if needed:</div>
                <div className="flex flex-wrap gap-2">
                  {DOCTORS.find((d) => d.id === doctorId)?.depts.map((did) => (
                    <button key={did} onClick={() => setDeptId(did)} className={`hosp-chip ${deptId === did ? "hosp-ring" : ""}`}>{DEPARTMENTS.find((d) => d.id === did)?.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <div className="text-gray-500">Select a doctor to proceed to slots.</div>
            <button className="hosp-btn hosp-btn-primary" disabled={!canContinueFromSelect} onClick={() => setStep(1)}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 1: Date & Slot */}
      {step === 1 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Select date & time</h2>
            <button className="hosp-link" onClick={() => resetFrom(0)}>Change doctor/department</button>
          </div>

          <div className="hosp-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{DOCTORS.find((d) => d.id === doctorId)?.name}</div>
                <div className="text-xs text-gray-600"><DepartmentName id={deptId}/> · {DOCTORS.find((d) => d.id === doctorId)?.location}</div>
              </div>
              {dateISO && time && holdExpiry && (
                <div role="status" aria-live="polite" className="text-xs text-gray-600">Slot held for <span className="font-semibold">{Math.floor(holdRemaining / 60)}:{pad(holdRemaining % 60)}</span> minutes.</div>
              )}
            </div>

            <div className="mt-3">
              <Legend />
              <div className="mt-2">
                <MonthCalendar doctorId={doctorId} selectedDateISO={dateISO} onSelectDate={setDateISO} />
              </div>
              {dateISO && (
                <div className="mt-3">
                  <h3 className="font-medium">Slots on {new Date(dateISO).toLocaleDateString()}</h3>
                  <Slots doctorId={doctorId} dateISO={dateISO} selectedTime={time} onSelectTime={setTime} />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button className="hosp-btn hosp-btn-outline" onClick={() => resetFrom(0)}>Back</button>
            <button className="hosp-btn hosp-btn-primary" disabled={!canContinueFromSlot} onClick={() => setStep(2)}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 2: OTP */}
      {step === 2 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Verify your phone</h2>
            <button className="hosp-link" onClick={() => resetFrom(1)}>Change slot</button>
          </div>
          <label className="block">
            <span className="block text-sm font-medium">Phone number</span>
            <input className="mt-1 w-full border rounded-lg p-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9198XXXXXXXX" />
          </label>
          <div className="flex items-center gap-2">
            <button className="hosp-btn hosp-btn-outline" onClick={sendOtp} disabled={!phone}>Send OTP</button>
            {otpStatus === "sent" && <span className="text-xs text-gray-600">OTP sent (use <span className="font-mono">{SAMPLE.otpCode}</span> for demo)</span>}
          </div>
          {otpError && <div className="text-red-600 text-sm">{otpError}</div>}
          {otpStatus !== "idle" && (
            <div className="mt-2">
              <label className="block">
                <span className="block text-sm font-medium">Enter OTP</span>
                <input className="mt-1 w-full border rounded-lg p-2 font-mono" maxLength={6} onChange={(e) => { if (e.target.value.length === 6) verifyOtp(e.target.value); }} placeholder="6-digit code" />
              </label>
            </div>
          )}
          <div className="flex justify-between">
            <button className="hosp-btn hosp-btn-outline" onClick={() => resetFrom(1)}>Back</button>
            <button className="hosp-btn hosp-btn-primary" disabled={!canContinueFromOtp} onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 3: Patient selection/creation */}
      {step === 3 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Who is this appointment for?</h2>
            <button className="hosp-link" onClick={() => resetFrom(2)}>Change phone</button>
          </div>

          {patients.length > 0 ? (
            <div className="space-y-2">
              {patients.map((p) => (
                <label key={p.id} className={`flex items-center justify-between border rounded-lg p-3 bg-white ${selectedPatientId === p.id ? "hosp-ring" : ""}`}>
                  <div className="flex items-center gap-3">
                    <input type="radio" name="patient" checked={selectedPatientId === p.id} onChange={() => setSelectedPatientId(p.id)} />
                    <div>
                      <div className="font-medium">{p.firstName} {p.lastName} <span className="text-xs text-gray-500">MRN {p.mrn}</span></div>
                      <div className="text-xs text-gray-600">{p.gender} · DOB {p.dob}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-lg border">No patient profiles found for this number.</div>
          )}

          <details className="border rounded-lg p-3 bg-white">
            <summary className="cursor-pointer font-medium">Add new patient</summary>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <label className="block"><span className="block text-sm">First name</span><input className="mt-1 w-full border rounded-lg p-2" value={newP.firstName} onChange={(e) => setNewP({ ...newP, firstName: e.target.value })} /></label>
              <label className="block"><span className="block text-sm">Last name</span><input className="mt-1 w-full border rounded-lg p-2" value={newP.lastName} onChange={(e) => setNewP({ ...newP, lastName: e.target.value })} /></label>
              <label className="block"><span className="block text-sm">Email</span><input type="email" className="mt-1 w-full border rounded-lg p-2" value={newP.email} onChange={(e) => setNewP({ ...newP, email: e.target.value })} /></label>
              <label className="block"><span className="block text-sm">Date of birth</span><input type="date" className="mt-1 w-full border rounded-lg p-2" value={newP.dob} onChange={(e) => setNewP({ ...newP, dob: e.target.value })} /></label>
              <label className="block"><span className="block text-sm">Gender</span>
                <select className="mt-1 w-full border rounded-lg p-2" value={newP.gender} onChange={(e) => setNewP({ ...newP, gender: e.target.value })}>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 mt-3"><input type="checkbox" checked={captchaChecked} onChange={(e) => setCaptchaChecked(e.target.checked)} /><span className="text-sm">I'm not a robot (demo CAPTCHA)</span></label>
            <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span className="text-sm">I consent to processing my data for booking (privacy notice)</span></label>
            <div className="mt-3">
              <button className="hosp-btn hosp-btn-outline" onClick={createNewPatient} disabled={!captchaChecked || !consent}>Save new patient</button>
            </div>
          </details>

          <div className="flex justify-between mt-2">
            <button className="hosp-btn hosp-btn-outline" onClick={() => resetFrom(2)}>Back</button>
            <button className="hosp-btn hosp-btn-primary" disabled={!canContinueFromPatient} onClick={() => setStep(4)}>Continue</button>
          </div>
        </section>
      )}

      {/* Step 4: Review & Submit */}
      {step === 4 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Review your appointment</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="hosp-card">
              <div className="font-medium">Details</div>
              <dl className="text-sm mt-2 grid grid-cols-3 gap-y-1">
                <dt className="text-gray-500">Department</dt><dd className="col-span-2">{selectedDept?.name}</dd>
                <dt className="text-gray-500">Doctor</dt><dd className="col-span-2">{selectedDoctor?.name}</dd>
                <dt className="text-gray-500">Date</dt><dd className="col-span-2">{new Date(dateISO).toLocaleDateString()}</dd>
                <dt className="text-gray-500">Time</dt><dd className="col-span-2">{time}</dd>
                <dt className="text-gray-500">Location</dt><dd className="col-span-2">{selectedDoctor?.location}</dd>
              </dl>
            </div>
            <div className="hosp-card">
              <div className="font-medium">Patient</div>
              {selectedPatient ? (
                <div className="text-sm mt-2">{selectedPatient.firstName} {selectedPatient.lastName} · MRN {selectedPatient.mrn}</div>
              ) : (
                <div className="text-sm mt-2">{newP.firstName} {newP.lastName} (MRN will be generated)</div>
              )}
              <div className="text-xs text-gray-600 mt-2">Please arrive 15 minutes early. Carry a photo ID and previous reports.</div>
            </div>
          </div>
          <div className="flex justify-between">
            <button className="hosp-btn hosp-btn-outline" onClick={() => resetFrom(3)}>Back</button>
            <button className="hosp-btn hosp-btn-primary" disabled={confirming} onClick={submitBooking}>{confirming ? "Booking..." : "Confirm appointment"}</button>
          </div>
        </section>
      )}

      {/* Step 5: Confirmation */}
      {step === 5 && confirmation && (
        <section className="space-y-3">
          <div className="p-4 rounded-2xl" style={{ background: "color-mix(in srgb, var(--hosp-primary) 10%, white)" }}>
            <h2 className="text-xl font-bold" style={{ color: 'var(--hosp-primary)' }}>Your appointment is booked!</h2>
            <p className="mt-1 text-sm">Appointment ID: <span className="font-mono">{confirmation.appointmentId}</span></p>
            <p className="mt-1 text-sm">Patient: <strong>{confirmation.patientName}</strong> · MRN <strong>{confirmation.mrn}</strong></p>
            <p className="mt-1 text-sm">Doctor: {selectedDoctor?.name} ({selectedDept?.name})</p>
            <p className="mt-1 text-sm">Date & Time: {new Date(dateISO).toLocaleDateString()} {time}</p>
            <p className="mt-3 text-sm font-medium">Instructions</p>
            <ul className="list-disc list-inside text-sm text-gray-700">
              <li>Arrive 15 minutes early at {selectedDoctor?.location}.</li>
              <li>Carry a government-issued photo ID and previous reports.</li>
              <li>If unwell or late, contact the clinic reception.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button className="hosp-btn hosp-btn-outline">Add to Calendar</button>
              <button className="hosp-btn hosp-btn-outline">Download/Print</button>
              <button className="hosp-btn hosp-btn-primary" onClick={() => resetFrom(0)}>Book another</button>
            </div>
          </div>
        </section>
      )}

      <footer className="mt-10 text-xs text-gray-500">
        <p>Demo only: For production, connect secure backend APIs (OTP, patients, availability, booking with server-side locks) and a real CAPTCHA. MRN is assigned by HIS.</p>
      </footer>
    </div>
  );
}
