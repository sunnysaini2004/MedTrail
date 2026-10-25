import { useCallback, useEffect, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { apiRequest } from "../lib/api.js";

function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [accessGrants, setAccessGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [doctorResult, patientResult, accessResult] = await Promise.all([
        apiRequest("/admin/doctors"),
        apiRequest("/admin/patients"),
        apiRequest("/admin/patient-access"),
      ]);
      setDoctors(doctorResult.doctors);
      setPatients(patientResult.patients);
      setAccessGrants(accessResult.accessGrants);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateDoctor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/doctors", { method: "POST", body: JSON.stringify(details) });
      form.reset();
      setMessage("Doctor account created. Share the temporary credentials securely.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGrantAccess(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/patient-access", { method: "POST", body: JSON.stringify(details) });
      setMessage("Doctor access granted for that patient.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeAccess(grant) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/patient-access", {
        method: "PATCH",
        body: JSON.stringify({ patientCode: grant.patientCode, doctorUserId: grant.doctorUserId }),
      });
      setMessage("Doctor access revoked.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs font-bold tracking-[0.2em] text-teal-700">ADMINISTRATION</p>
          <h1 className="mt-2 text-3xl font-bold">Accounts and access</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Create doctor accounts and grant or revoke doctor access to a patient. Use synthetic project data only.</p>
        </header>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800" role="alert">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" role="status">{message}</p>}
        {loading && <p aria-live="polite">Loading administration data...</p>}

        <section className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleCreateDoctor}>
            <div>
              <h2 className="text-xl font-semibold">Create doctor account</h2>
              <p className="mt-1 text-sm text-slate-600">Doctor accounts can only be created by an administrator.</p>
            </div>
            <label className="block text-sm font-medium">Full name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="fullName" autoComplete="name" maxLength={120} required /></label>
            <label className="block text-sm font-medium">Email<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="email" type="email" autoComplete="email" maxLength={255} required /></label>
            <label className="block text-sm font-medium">Temporary password<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
            <label className="block text-sm font-medium">Specialty<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="specialty" maxLength={120} required /></label>
            <label className="block text-sm font-medium">Registration number (optional)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="registrationNumber" maxLength={100} /></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Saving..." : "Create doctor"}</button>
          </form>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleGrantAccess}>
            <div>
              <h2 className="text-xl font-semibold">Grant patient access</h2>
              <p className="mt-1 text-sm text-slate-600">A doctor only sees treatment records while an active grant exists.</p>
            </div>
            <label className="block text-sm font-medium">Patient<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="patientCode" required defaultValue=""><option value="" disabled>Select a patient</option>{patients.map((patient) => <option key={patient.patientCode} value={patient.patientCode}>{patient.fullName} · {patient.patientCode}</option>)}</select></label>
            <label className="block text-sm font-medium">Doctor<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="doctorUserId" required defaultValue=""><option value="" disabled>Select a doctor</option>{doctors.map((doctor) => <option key={doctor.userId} value={doctor.userId}>{doctor.fullName} · {doctor.specialty}</option>)}</select></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy || !doctors.length || !patients.length}>{busy ? "Saving..." : "Grant access"}</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div><h2 className="text-xl font-semibold">Doctor access grants</h2><p className="text-sm text-slate-600">Revocation takes effect on the next API request.</p></div>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={loadData} disabled={loading}>Refresh</button>
          </div>
          {accessGrants.length === 0 ? <p className="p-6 text-slate-600">No doctor access grants yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-6 py-3">Patient</th><th className="px-6 py-3">Doctor</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{accessGrants.map((grant) => <tr key={grant.patientCode + "-" + grant.doctorUserId}><td className="px-6 py-3">{grant.patientName}<span className="block text-xs text-slate-500">{grant.patientCode}</span></td><td className="px-6 py-3">{grant.doctorName}<span className="block text-xs text-slate-500">{grant.specialty}</span></td><td className="px-6 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{grant.status}</span></td><td className="px-6 py-3">{grant.status === "ACTIVE" && <button className="font-semibold text-red-700 hover:underline" type="button" onClick={() => revokeAccess(grant)} disabled={busy}>Revoke</button>}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default AdminDashboard;
