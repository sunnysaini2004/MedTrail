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

  useEffect(() => { loadData(); }, [loadData]);

  async function submitForm(event, path, method, successMessage) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(path, { method, body: JSON.stringify(details) });
      form.reset();
      setMessage(successMessage);
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePatient(patient) {
    const warning = "Delete " + patient.fullName + " and their linked consultations, prescriptions, referrals, and doctor access? This keeps other accounts and the audit history.";
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/patients/" + encodeURIComponent(patient.patientCode), { method: "DELETE" });
      setMessage("Patient and linked clinical records deleted.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoctor(doctor) {
    const warning = "Delete " + doctor.fullName + " and consultations, prescriptions, referrals, and access grants linked to this doctor? Other patients and doctors are kept.";
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/admin/doctors/" + encodeURIComponent(doctor.userId), { method: "DELETE" });
      setMessage("Doctor and linked clinical records deleted.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const activeGrantCount = accessGrants.filter((grant) => grant.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs font-bold tracking-[0.2em] text-teal-700">ADMINISTRATION</p>
          <h1 className="mt-2 text-3xl font-bold">MediTrail admin workspace</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Manage synthetic patient and doctor accounts, assignments, and access.</p>
        </header>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800" role="alert">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" role="status">{message}</p>}
        {loading && <p aria-live="polite">Loading administration data...</p>}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Account summary">
          {[["Patients", patients.length], ["Doctors", doctors.length], ["Active assignments", activeGrantCount]].map(([label, count]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{count}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/admin/patients", "POST", "Patient account created.")}>
            <div><h2 className="text-xl font-semibold">Add patient</h2><p className="mt-1 text-sm text-slate-600">This form always creates a patient account.</p></div>
            <label className="block text-sm font-medium">Full name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="fullName" autoComplete="name" maxLength={120} required /></label>
            <label className="block text-sm font-medium">Gmail address<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="email" type="email" placeholder="patient@gmail.com" autoComplete="email" maxLength={255} required /></label>
            <label className="block text-sm font-medium">Temporary password<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="password" type="password" autoComplete="new-password" minLength={4} maxLength={72} required /></label>
            <label className="block text-sm font-medium">Phone (optional)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="phone" type="tel" maxLength={20} /></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Saving..." : "Add patient"}</button>
          </form>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/admin/doctors", "POST", "Doctor account created.")}>
            <div><h2 className="text-xl font-semibold">Add doctor</h2><p className="mt-1 text-sm text-slate-600">Only an admin can create doctor accounts.</p></div>
            <label className="block text-sm font-medium">Full name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="fullName" autoComplete="name" maxLength={120} required /></label>
            <label className="block text-sm font-medium">Gmail address<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="email" type="email" placeholder="doctor@gmail.com" autoComplete="email" maxLength={255} required /></label>
            <label className="block text-sm font-medium">Temporary password<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
            <label className="block text-sm font-medium">Specialty<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="specialty" maxLength={120} required /></label>
            <label className="block text-sm font-medium">Registration number (optional)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="registrationNumber" maxLength={100} /></label>
            <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Saving..." : "Add doctor"}</button>
          </form>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/admin/patient-assignment", "PUT", "Patient assignment updated.")}>
            <div><h2 className="text-xl font-semibold">Assign or change doctor</h2><p className="mt-1 text-sm text-slate-600">Changing the assignment revokes the patient’s other active doctor grants.</p></div>
            <label className="block text-sm font-medium">Patient<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="patientCode" required defaultValue=""><option value="" disabled>Select a patient</option>{patients.map((patient) => <option key={patient.patientCode} value={patient.patientCode}>{patient.fullName} · {patient.patientCode}</option>)}</select></label>
            <label className="block text-sm font-medium">Doctor<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="doctorUserId" required defaultValue=""><option value="" disabled>Select a doctor</option>{doctors.map((doctor) => <option key={doctor.userId} value={doctor.userId}>{doctor.fullName} · {doctor.specialty}</option>)}</select></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy || !doctors.length || !patients.length}>{busy ? "Saving..." : "Assign doctor"}</button>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4"><h2 className="text-xl font-semibold">Patients</h2><p className="text-sm text-slate-600">Patient accounts and their current active doctor.</p></div>
            {patients.length === 0 ? <p className="p-6 text-slate-600">No patients yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Patient</th><th className="px-5 py-3">Assigned doctor</th><th className="px-5 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{patients.map((patient) => <tr key={patient.patientCode}>
                  <td className="px-5 py-3"><span className="font-semibold">{patient.fullName}</span><span className="block text-xs text-slate-500">{patient.email} · {patient.patientCode}</span></td>
                  <td className="px-5 py-3">{patient.assignedDoctorName || "Not assigned"}</td>
                  <td className="px-5 py-3"><button className="font-semibold text-red-700 hover:underline disabled:opacity-50" type="button" onClick={() => deletePatient(patient)} disabled={busy}>Delete</button></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4"><h2 className="text-xl font-semibold">Doctors</h2><p className="text-sm text-slate-600">Doctor accounts provisioned by an administrator.</p></div>
            {doctors.length === 0 ? <p className="p-6 text-slate-600">No doctors yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Doctor</th><th className="px-5 py-3">Specialty</th><th className="px-5 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{doctors.map((doctor) => <tr key={doctor.userId}>
                  <td className="px-5 py-3"><span className="font-semibold">{doctor.fullName}</span><span className="block text-xs text-slate-500">{doctor.email}</span></td>
                  <td className="px-5 py-3">{doctor.specialty}</td>
                  <td className="px-5 py-3"><button className="font-semibold text-red-700 hover:underline disabled:opacity-50" type="button" onClick={() => deleteDoctor(doctor)} disabled={busy}>Delete</button></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4"><h2 className="text-xl font-semibold">Doctor access history</h2><p className="text-sm text-slate-600">Revoked grants remain listed for the demo's access history.</p></div>
          {accessGrants.length === 0 ? <p className="p-6 text-slate-600">No access grants yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Patient</th><th className="px-5 py-3">Doctor</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{accessGrants.map((grant) => <tr key={grant.patientCode + "-" + grant.doctorUserId}><td className="px-5 py-3">{grant.patientName}<span className="block text-xs text-slate-500">{grant.patientCode}</span></td><td className="px-5 py-3">{grant.doctorName}<span className="block text-xs text-slate-500">{grant.specialty}</span></td><td className="px-5 py-3">{grant.status}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default AdminDashboard;
