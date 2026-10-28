import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { apiRequest } from "../lib/api.js";
import { formatBloodGroup } from "../lib/bloodGroup.js";

const inputClass = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
const labelClass = "block min-w-0 text-sm font-medium text-slate-700";
const actionClass = "inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const neutralButton = actionClass + " border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:outline-teal-700";
const tealButton = actionClass + " bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-700";
const redButton = actionClass + " border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-700";
const sectionLabels = {
  doctors: "Doctors",
  patients: "Patients",
  accessGrants: "Doctor access history",
  accounts: "Account management",
};
const emptyHospitalSettings = { hospitalName: "", officialEmail: "", contactPhone: "", address: "", workingHours: "" };

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString();
}

function Badge({ children, active = false }) {
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")}>{children}</span>;
}

function Detail({ label, value }) {
  return <div className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{value || "Not recorded"}</dd></div>;
}

function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accessGrants, setAccessGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadFailures, setLoadFailures] = useState({});
  const [message, setMessage] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [details, setDetails] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [hospitalSettings, setHospitalSettings] = useState(emptyHospitalSettings);
  const [hospitalSettingsLoading, setHospitalSettingsLoading] = useState(true);
  const [hospitalSettingsSaving, setHospitalSettingsSaving] = useState(false);
  const [hospitalSettingsError, setHospitalSettingsError] = useState("");
  const [hospitalSettingsMessage, setHospitalSettingsMessage] = useState("");
  const loadRequestId = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const sections = [
        { key: "doctors", path: "/admin/doctors", set: setDoctors },
        { key: "patients", path: "/admin/patients", set: setPatients },
        { key: "accessGrants", path: "/admin/patient-access", set: setAccessGrants },
        { key: "accounts", path: "/admin/accounts", set: setAccounts },
      ];
      const results = await Promise.allSettled(sections.map((section) => apiRequest(section.path)));
      if (requestId !== loadRequestId.current) return;
      const failures = {};
      results.forEach((result, index) => {
        const section = sections[index];
        if (result.status === "rejected") {
          failures[section.key] = result.reason?.message || "Request failed.";
          return;
        }

        const rows = result.value?.[section.key];
        if (!Array.isArray(rows)) {
          failures[section.key] = "The server returned an unexpected response.";
          return;
        }
        section.set(rows);
      });
      setLoadFailures(failures);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => { loadRequestId.current += 1; };
  }, [loadData]);

  useEffect(() => {
    let active = true;
    apiRequest("/admin/hospital-settings")
      .then((result) => { if (active) setHospitalSettings({ ...emptyHospitalSettings, ...result.settings }); })
      .catch((requestError) => { if (active) setHospitalSettingsError(requestError.message); })
      .finally(() => { if (active) setHospitalSettingsLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveHospitalSettings(event) {
    event.preventDefault();
    setHospitalSettingsSaving(true);
    setHospitalSettingsError("");
    setHospitalSettingsMessage("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await apiRequest("/admin/hospital-settings", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setHospitalSettings({ ...emptyHospitalSettings, ...result.settings });
      setHospitalSettingsMessage("Hospital contact details saved.");
    } catch (requestError) {
      setHospitalSettingsError(requestError.message);
    } finally {
      setHospitalSettingsSaving(false);
    }
  }

  const filteredPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    return term ? patients.filter((item) => [item.fullName, item.email, item.patientCode].some((value) => String(value || "").toLowerCase().includes(term))) : patients;
  }, [patients, patientSearch]);

  const filteredDoctors = useMemo(() => {
    const term = doctorSearch.trim().toLowerCase();
    return term ? doctors.filter((item) => [item.fullName, item.email, item.specialty].some((value) => String(value || "").toLowerCase().includes(term))) : doctors;
  }, [doctors, doctorSearch]);

  async function submitForm(event, path, method, successMessage) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError(""); setMessage("");
    try {
      await apiRequest(path, { method, body: JSON.stringify(values) });
      form.reset(); setMessage(successMessage); await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function searchAccounts(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: accountSearch.trim() });
      const result = await apiRequest("/admin/accounts?" + query.toString());
      setAccounts(result.accounts);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function resetPassword(account) {
    if (!window.confirm("Generate a one-time temporary password for " + account.fullName + "? Existing sessions will end, and MediTrail will require a new password at next sign-in.")) return;
    setBusy(true); setError(""); setMessage(""); setCopyMessage("");
    try {
      const result = await apiRequest("/admin/accounts/" + encodeURIComponent(account.id) + "/reset-password", { method: "POST" });
      setResetResult({ account, temporaryPassword: result.temporaryPassword });
      setDetails(null); await loadData();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopyMessage("Copied. Share the temporary password directly with the account owner.");
    } catch { setCopyMessage("Copy unavailable. Select the password and copy it manually."); }
  }

  async function deletePatient(patient) {
    if (!window.confirm("Delete " + patient.fullName + " and linked consultations, prescriptions, referrals, and access? Audit history remains.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await apiRequest("/admin/patients/" + encodeURIComponent(patient.patientCode), { method: "DELETE" });
      setDetails(null); setMessage("Patient and linked clinical records deleted."); await loadData();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function deleteDoctor(doctor) {
    if (!window.confirm("Delete " + doctor.fullName + " and linked consultations, prescriptions, referrals, and access grants? Other accounts are kept.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await apiRequest("/admin/doctors/" + encodeURIComponent(doctor.userId), { method: "DELETE" });
      setDetails(null); setMessage("Doctor and linked clinical records deleted."); await loadData();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const activeGrantCount = accessGrants.filter((grant) => grant.status === "ACTIVE").length;
  const activePatients = patients.filter((item) => item.isActive);
  const activeDoctors = doctors.filter((item) => item.isActive);

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-800">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-10">
        <header>
          <p className="text-xs font-bold tracking-[0.2em] text-teal-700">ADMINISTRATION</p>
          <h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">MediTrail admin workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Manage synthetic accounts, assignments, and access. These actions are protected for administrators.</p>
        </header>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="hospital-settings-heading">
          <div className="mb-4"><h2 id="hospital-settings-heading" className="text-xl font-bold">Hospital contact settings</h2><p className="mt-1 text-sm text-slate-600">These details appear on the public home page. Leave a field blank to hide it.</p></div>
          {hospitalSettingsError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{hospitalSettingsError}</p>}
          {hospitalSettingsMessage && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{hospitalSettingsMessage}</p>}
          {hospitalSettingsLoading ? <p aria-live="polite" className="text-sm text-slate-600">Loading hospital settings...</p> : (
            <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={saveHospitalSettings}>
              <label className={labelClass}>Hospital name<input className={inputClass} name="hospitalName" value={hospitalSettings.hospitalName} onChange={(event) => setHospitalSettings((current) => ({ ...current, hospitalName: event.target.value }))} maxLength={160} /></label>
              <label className={labelClass}>Official email<input className={inputClass} name="officialEmail" type="email" value={hospitalSettings.officialEmail} onChange={(event) => setHospitalSettings((current) => ({ ...current, officialEmail: event.target.value }))} maxLength={254} /></label>
              <label className={labelClass}>Contact phone<input className={inputClass} name="contactPhone" type="tel" value={hospitalSettings.contactPhone} onChange={(event) => setHospitalSettings((current) => ({ ...current, contactPhone: event.target.value }))} maxLength={30} /></label>
              <label className={labelClass}>Working hours<textarea className={inputClass} name="workingHours" rows={2} value={hospitalSettings.workingHours} onChange={(event) => setHospitalSettings((current) => ({ ...current, workingHours: event.target.value }))} maxLength={250} /></label>
              <label className={labelClass + " sm:col-span-2"}>Address<textarea className={inputClass} name="address" rows={3} value={hospitalSettings.address} onChange={(event) => setHospitalSettings((current) => ({ ...current, address: event.target.value }))} maxLength={500} /></label>
              <div className="sm:col-span-2"><button className={tealButton} type="submit" disabled={hospitalSettingsSaving}>{hospitalSettingsSaving ? "Saving..." : "Save hospital settings"}</button></div>
            </form>
          )}
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        {Object.keys(loadFailures).length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Some admin sections could not load. The other sections can still be used.</p>
          <ul className="mt-2 list-inside list-disc">{Object.entries(loadFailures).map(([key, reason]) => <li key={key}><strong>{sectionLabels[key]}:</strong> {reason}</li>)}</ul>
          <button className={neutralButton + " mt-3"} type="button" disabled={loading} onClick={loadData}>{loading ? "Retrying..." : "Retry dashboard data"}</button>
        </div>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p>}
        {loading && <p className="rounded-lg bg-white p-4 text-sm text-slate-600" aria-live="polite">Loading administration data...</p>}

        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Account summary">
          {[["Patients", patients.length, "patients"], ["Doctors", doctors.length, "doctors"], ["Active assignments", activeGrantCount, "accessGrants"]].map(([label, count, key]) => (
            <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{loadFailures[key] ? "—" : count}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="create-accounts-heading">
          <div className="mb-4"><h2 id="create-accounts-heading" className="text-xl font-bold">Create and assign accounts</h2><p className="mt-1 text-sm text-slate-600">The server decides each account role.</p></div>
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
            <form className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" onSubmit={(event) => submitForm(event, "/admin/patients", "POST", "Patient account created.")}>
              <div><h3 className="text-lg font-semibold">Add patient</h3><p className="text-sm text-slate-600">This form always creates a patient account.</p></div>
              <label className={labelClass}>Full name<input className={inputClass} name="fullName" autoComplete="name" maxLength={120} required /></label>
              <label className={labelClass}>Gmail address<input className={inputClass} name="email" type="email" placeholder="patient@gmail.com" autoComplete="email" maxLength={255} required /></label>
              <label className={labelClass}>Initial password<PasswordInput className={inputClass} name="password" autoComplete="new-password" minLength={4} maxLength={72} required /></label>
              <label className={labelClass}>Phone (optional)<input className={inputClass} name="phone" type="tel" maxLength={20} /></label>
              <button className={tealButton} type="submit" disabled={busy}>{busy ? "Saving..." : "Add patient"}</button>
            </form>
            <form className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" onSubmit={(event) => submitForm(event, "/admin/doctors", "POST", "Doctor account created.")}>
              <div><h3 className="text-lg font-semibold">Add doctor</h3><p className="text-sm text-slate-600">Only an admin can create a doctor account.</p></div>
              <label className={labelClass}>Full name<input className={inputClass} name="fullName" autoComplete="name" maxLength={120} required /></label>
              <label className={labelClass}>Gmail address<input className={inputClass} name="email" type="email" placeholder="doctor@gmail.com" autoComplete="email" maxLength={255} required /></label>
              <label className={labelClass}>Initial password<PasswordInput className={inputClass} name="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
              <label className={labelClass}>Specialty<input className={inputClass} name="specialty" maxLength={120} required /></label>
              <label className={labelClass}>Registration number (optional)<input className={inputClass} name="registrationNumber" maxLength={100} /></label>
              <button className={tealButton} type="submit" disabled={busy}>{busy ? "Saving..." : "Add doctor"}</button>
            </form>
            <form className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" onSubmit={(event) => submitForm(event, "/admin/patient-assignment", "PUT", "Patient assignment updated.")}>
              <div><h3 className="text-lg font-semibold">Assign or change doctor</h3><p className="text-sm text-slate-600">Changing assignment revokes other active grants; revoked history stays visible.</p></div>
              <label className={labelClass}>Patient<select className={inputClass} name="patientCode" required defaultValue=""><option value="" disabled>Select a patient</option>{activePatients.map((item) => <option key={item.patientCode} value={item.patientCode}>{item.fullName} · {item.patientCode}</option>)}</select></label>
              <label className={labelClass}>Doctor<select className={inputClass} name="doctorUserId" required defaultValue=""><option value="" disabled>Select a doctor</option>{activeDoctors.map((item) => <option key={item.userId} value={item.userId}>{item.fullName} · {item.specialty}</option>)}</select></label>
              <button className={tealButton} type="submit" disabled={busy || !activeDoctors.length || !activePatients.length}>{busy ? "Saving..." : "Assign doctor"}</button>
            </form>
          </div>
        </section>
        <section className="min-w-0" aria-labelledby="patients-heading">
          <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 id="patients-heading" className="text-xl font-bold">Patients</h2><p className="mt-1 text-sm text-slate-600">Search by name, email, or patient ID.</p></div>
            <label className="block w-full sm:max-w-sm"><span className="sr-only">Search patients</span><input className={inputClass} type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patients..." /></label>
          </div>
          {filteredPatients.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{loadFailures.patients ? "Patient data is unavailable. Use Retry dashboard data above." : patients.length ? "No patients match this search." : "No patients yet."}</p> : <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Patient ID</th><th className="px-4 py-3">Assigned doctor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filteredPatients.map((item) => <tr key={item.userId}>
                  <td className="max-w-[240px] px-4 py-3"><b className="block break-words">{item.fullName}</b><span className="block break-all text-xs text-slate-500">{item.email}</span></td>
                  <td className="break-all px-4 py-3 font-mono text-xs">{item.patientCode}</td>
                  <td className="max-w-[190px] px-4 py-3"><span className="block break-words">{item.assignedDoctorName || "Not assigned"}</span>{item.assignedDoctorEmail && <span className="break-all text-xs text-slate-500">{item.assignedDoctorEmail}</span>}</td>
                  <td className="px-4 py-3"><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button className={neutralButton} type="button" onClick={() => setDetails({ type: "patient", record: item })}>View details</button><button className={neutralButton} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword({ id: item.userId, fullName: item.fullName })}>Reset password</button><button className={redButton} type="button" disabled={busy} onClick={() => deletePatient(item)}>Delete</button></div></td>
                </tr>)}</tbody>
              </table>
            </div></div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">{filteredPatients.map((item) => <article key={item.userId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.fullName}</h3><p className="break-all text-sm text-slate-600">{item.email}</p></div><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></div>
              <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><Detail label="Patient ID" value={item.patientCode} /><Detail label="Assigned doctor" value={item.assignedDoctorName || "Not assigned"} /><Detail label="Created" value={formatDate(item.createdAt)} /></dl>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><button className={neutralButton} type="button" onClick={() => setDetails({ type: "patient", record: item })}>View details</button><button className={neutralButton} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword({ id: item.userId, fullName: item.fullName })}>Reset password</button><button className={redButton} type="button" disabled={busy} onClick={() => deletePatient(item)}>Delete</button></div>
            </article>)}</div>
          </>}
        </section>
        <section className="min-w-0" aria-labelledby="doctors-heading">
          <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 id="doctors-heading" className="text-xl font-bold">Doctors</h2><p className="mt-1 text-sm text-slate-600">Search by name, email, or specialty.</p></div>
            <label className="block w-full sm:max-w-sm"><span className="sr-only">Search doctors</span><input className={inputClass} type="search" value={doctorSearch} onChange={(event) => setDoctorSearch(event.target.value)} placeholder="Search doctors..." /></label>
          </div>
          {filteredDoctors.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{loadFailures.doctors ? "Doctor data is unavailable. Use Retry dashboard data above." : doctors.length ? "No doctors match this search." : "No doctors yet."}</p> : <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Doctor</th><th className="px-4 py-3">Specialty</th><th className="px-4 py-3">Patients</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filteredDoctors.map((item) => <tr key={item.userId}>
                  <td className="max-w-[240px] px-4 py-3"><b className="block break-words">{item.fullName}</b><span className="block break-all text-xs text-slate-500">{item.email}</span></td>
                  <td className="break-words px-4 py-3">{item.specialty}</td><td className="px-4 py-3">{item.assignedPatientCount}</td>
                  <td className="px-4 py-3"><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button className={neutralButton} type="button" onClick={() => setDetails({ type: "doctor", record: item })}>View details</button><button className={neutralButton} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword({ id: item.userId, fullName: item.fullName })}>Reset password</button><button className={redButton} type="button" disabled={busy} onClick={() => deleteDoctor(item)}>Delete</button></div></td>
                </tr>)}</tbody>
              </table>
            </div></div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">{filteredDoctors.map((item) => <article key={item.userId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.fullName}</h3><p className="break-all text-sm text-slate-600">{item.email}</p></div><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></div>
              <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><Detail label="Specialty" value={item.specialty} /><Detail label="Assigned patients" value={item.assignedPatientCount} /><Detail label="Created" value={formatDate(item.createdAt)} /></dl>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><button className={neutralButton} type="button" onClick={() => setDetails({ type: "doctor", record: item })}>View details</button><button className={neutralButton} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword({ id: item.userId, fullName: item.fullName })}>Reset password</button><button className={redButton} type="button" disabled={busy} onClick={() => deleteDoctor(item)}>Delete</button></div>
            </article>)}</div>
          </>}
        </section>

        <section className="min-w-0" aria-labelledby="accounts-heading">
          <div className="mb-4"><h2 id="accounts-heading" className="text-xl font-bold">Account management</h2><p className="mt-1 text-sm text-slate-600">Find a patient or doctor who needs a new temporary password. The old password cannot be viewed.</p></div>
          <form className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row" onSubmit={searchAccounts}>
            <label className="min-w-0 flex-1"><span className="sr-only">Search accounts by name, email, or account ID</span><input className={inputClass} value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} maxLength={120} placeholder="Name, email, or account ID" /></label>
            <button className={neutralButton} type="submit" disabled={busy}>{busy ? "Searching..." : "Search accounts"}</button>
            <button className={neutralButton} type="button" disabled={busy} onClick={() => { setAccountSearch(""); loadData(); }}>Show all</button>
          </form>
          {accounts.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{loadFailures.accounts ? "Account management data is unavailable. Use Retry dashboard data above." : "No patient or doctor accounts match."}</p> : <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">ID / type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recovery</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{accounts.map((item) => <tr key={item.id}>
                  <td className="max-w-[260px] px-4 py-3"><b className="block break-words">{item.fullName}</b><span className="block break-all text-xs text-slate-500">{item.email}</span></td>
                  <td className="px-4 py-3"><span className="font-mono text-xs">#{item.id}</span><span className="ml-2 text-slate-600">{item.role}</span></td>
                  <td className="px-4 py-3"><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3"><button className={neutralButton} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword(item)}>Issue temporary password</button></td>
                </tr>)}</tbody>
              </table>
            </div></div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">{accounts.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.fullName}</h3><p className="break-all text-sm text-slate-600">{item.email}</p></div><Badge active={Boolean(item.isActive)}>{item.isActive ? "Active" : "Inactive"}</Badge></div>
              <p className="mt-3 text-sm text-slate-600">Account #{item.id} · {item.role}</p><button className={neutralButton + " mt-3 w-full"} type="button" disabled={busy || !item.isActive} onClick={() => resetPassword(item)}>Issue temporary password</button>
            </article>)}</div>
          </>}
        </section>

        <section className="min-w-0" aria-labelledby="access-heading">
          <div className="mb-4"><h2 id="access-heading" className="text-xl font-bold">Doctor access history</h2><p className="mt-1 text-sm text-slate-600">Revoked entries remain here so assignment history is visible.</p></div>
          {accessGrants.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{loadFailures.accessGrants ? "Doctor access history is unavailable. Use Retry dashboard data above." : "No doctor access history yet."}</p> : <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Doctor</th><th className="px-4 py-3">Specialty</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Granted</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{accessGrants.map((grant, index) => <tr key={`${grant.patientCode}-${grant.doctorUserId}-${index}`}>
                  <td className="px-4 py-3"><span className="block">{grant.patientName}</span><span className="font-mono text-xs text-slate-500">{grant.patientCode}</span></td><td className="px-4 py-3">{grant.doctorName}</td><td className="px-4 py-3">{grant.specialty}</td><td className="px-4 py-3"><Badge active={grant.status === "ACTIVE"}>{grant.status === "ACTIVE" ? "Active" : "Revoked"}</Badge></td><td className="px-4 py-3">{formatDate(grant.grantedAt)}</td>
                </tr>)}</tbody>
              </table>
            </div></div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">{accessGrants.map((grant, index) => <article key={`${grant.patientCode}-${grant.doctorUserId}-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{grant.patientName}</h3><p className="font-mono text-xs text-slate-500">{grant.patientCode}</p></div><Badge active={grant.status === "ACTIVE"}>{grant.status === "ACTIVE" ? "Active" : "Revoked"}</Badge></div>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><Detail label="Doctor" value={grant.doctorName} /><Detail label="Specialty" value={grant.specialty} /><Detail label="Granted" value={formatDate(grant.grantedAt)} /></dl>
            </article>)}</div>
          </>}
        </section>
      </main>
      <Footer />

      {details && <Modal title={details.type === "patient" ? "Patient details" : "Doctor details"} onClose={() => setDetails(null)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {details.type === "patient" ? <>
            <Detail label="Full name" value={details.record.fullName} /><Detail label="Patient ID" value={details.record.patientCode} />
            <Detail label="Email address" value={details.record.email} /><Detail label="Mobile number" value={details.record.phone} />
            <Detail label="Date of birth" value={formatDate(details.record.dateOfBirth)} /><Detail label="Blood group" value={formatBloodGroup(details.record.bloodGroup)} />
            <Detail label="Assigned doctor" value={details.record.assignedDoctorName} /><Detail label="Doctor specialty" value={details.record.assignedDoctorSpecialty} />
            <Detail label="Account status" value={details.record.isActive ? "Active" : "Inactive"} /><Detail label="Account created" value={formatDate(details.record.createdAt)} />
            <p className="text-sm text-slate-600 sm:col-span-2">Gender, address, and emergency contact details are not stored in the current patient profile schema.</p>
          </> : <>
            <Detail label="Full name" value={details.record.fullName} /><Detail label="Account ID" value={details.record.userId} />
            <Detail label="Email address" value={details.record.email} /><Detail label="Specialty" value={details.record.specialty} />
            <Detail label="Registration number" value={details.record.registrationNumber} /><Detail label="Assigned patients" value={details.record.assignedPatientCount} />
            <Detail label="Account status" value={details.record.isActive ? "Active" : "Inactive"} /><Detail label="Account created" value={formatDate(details.record.createdAt)} />
          </>}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {details.type === "patient" ? <button className={redButton} type="button" disabled={busy} onClick={() => deletePatient(details.record)}>Delete patient</button> : <button className={redButton} type="button" disabled={busy} onClick={() => deleteDoctor(details.record)}>Delete doctor</button>}
          <button className={neutralButton} type="button" onClick={() => setDetails(null)}>Close</button>
        </div>
      </Modal>}

      {resetResult && <Modal title="One-time temporary password" onClose={() => setResetResult(null)}>
        <p className="text-sm text-slate-700">Share this once with <strong>{resetResult.account.fullName}</strong> through a private channel. It will not be shown again, and the account must change it after signing in.</p>
        <p className="mt-3 break-all rounded-lg border border-amber-200 bg-amber-50 p-4 font-mono text-lg text-slate-900" aria-label="Temporary password">{resetResult.temporaryPassword}</p>
        <p className="mt-2 text-xs text-slate-500">MediTrail has no email delivery configured. This password is stored only as a bcrypt hash.</p>
        {copyMessage && <p className="mt-3 text-sm text-emerald-800" role="status">{copyMessage}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={neutralButton} type="button" onClick={copyTemporaryPassword}>Copy password</button><button className={tealButton} type="button" onClick={() => setResetResult(null)}>Done</button></div>
      </Modal>}
    </div>
  );
}

export default AdminDashboard;
