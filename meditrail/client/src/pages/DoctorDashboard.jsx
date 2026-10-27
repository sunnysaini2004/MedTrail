import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { apiRequest } from "../lib/api.js";

function DoctorDashboard() {
  const [doctor, setDoctor] = useState(null);
  const [patients, setPatients] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [referralDoctors, setReferralDoctors] = useState([]);
  const [patientCode, setPatientCode] = useState("");
  const [consultations, setConsultations] = useState([]);
  const [consultationId, setConsultationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workspaceFailures, setWorkspaceFailures] = useState({});
  const [message, setMessage] = useState("");
  const consultationRequestId = useRef(0);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    const sections = [
      { key: "profile", path: "/doctor/me", dataKey: "doctor", set: setDoctor },
      { key: "patients", path: "/doctor/patients", dataKey: "patients", set: setPatients, isList: true },
      { key: "referrals", path: "/doctor/referrals/inbox", dataKey: "referrals", set: setReferrals, isList: true },
      { key: "referralDoctors", path: "/doctor/referrals/doctors", dataKey: "doctors", set: setReferralDoctors, isList: true },
    ];
    try {
      const results = await Promise.allSettled(sections.map((section) => apiRequest(section.path)));
      const failures = {};
      results.forEach((result, index) => {
        const section = sections[index];
        if (result.status === "rejected") {
          failures[section.key] = result.reason?.message || "Request failed.";
          return;
        }

        const data = result.value?.[section.dataKey];
        if (section.isList ? !Array.isArray(data) : !data || typeof data !== "object") {
          failures[section.key] = "The server returned an unexpected response.";
          return;
        }
        section.set(data);
        if (section.key === "patients") {
          setPatientCode((current) => data.some((item) => item.patientCode === current)
            ? current
            : data[0]?.patientCode || "");
        }
      });
      setWorkspaceFailures(failures);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConsultations = useCallback(async (code) => {
    const requestId = ++consultationRequestId.current;
    setConsultations([]);
    setConsultationId("");
    if (!code) {
      return;
    }
    try {
      const result = await apiRequest("/doctor/patients/" + encodeURIComponent(code) + "/consultations");
      if (requestId !== consultationRequestId.current) return;
      setConsultations(result.consultations);
      setConsultationId(String(result.consultations[0]?.id || ""));
    } catch (requestError) {
      if (requestId === consultationRequestId.current) setError(requestError.message);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    loadConsultations(patientCode);
    return () => { consultationRequestId.current += 1; };
  }, [patientCode, loadConsultations]);

  async function submitForm(event, path, transform, successMessage) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = transform ? transform(values) : values;
      await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
      form.reset();
      setMessage(successMessage);
      await loadWorkspace();
      if (patientCode) await loadConsultations(patientCode);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateReferral(referralId, status) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/doctor/referrals/" + referralId + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage("Referral updated to " + status.toLowerCase() + ".");
      await loadWorkspace();
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
          <p className="text-xs font-bold tracking-[0.2em] text-teal-700">DOCTOR PORTAL</p>
          <h1 className="mt-2 text-3xl font-bold">{doctor ? "Welcome, " + doctor.fullName : "Doctor workspace"}</h1>
          {doctor && <p className="mt-2 text-slate-600">{doctor.specialty}</p>}
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Patient records appear only after an administrator grant or accepted referral. Use synthetic project data only.</p>
        </header>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800" role="alert">{error}</p>}
        {Object.keys(workspaceFailures).length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Some doctor sections could not load. The others can still be used.</p>
          <ul className="mt-2 list-inside list-disc">{Object.entries(workspaceFailures).map(([section, reason]) => <li key={section}><strong>{section}:</strong> {reason}</li>)}</ul>
          <button className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold disabled:opacity-60" type="button" onClick={loadWorkspace} disabled={loading}>{loading ? "Retrying..." : "Retry dashboard data"}</button>
        </div>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" role="status">{message}</p>}
        {loading && <p aria-live="polite">Loading doctor workspace...</p>}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div><h2 className="text-xl font-semibold">Assigned patients</h2><p className="mt-1 text-sm text-slate-600">Only active access grants are listed.</p></div>
            {patients.length === 0 ? <p className="text-slate-600">No patients are assigned to your account.</p> : (
              <label className="block text-sm font-medium">Choose patient<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={patientCode} onChange={(event) => setPatientCode(event.target.value)}><option value="">Select a patient</option>{patients.map((patient) => <option key={patient.patientCode} value={patient.patientCode}>{patient.fullName} · {patient.patientCode}</option>)}</select></label>
            )}
            {patientCode && <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold">Blood group:</span> {patients.find((patient) => patient.patientCode === patientCode)?.bloodGroup || "Not recorded"}</div>}
          </div>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/doctor/consultations", (values) => ({ ...values, patientCode }), "Consultation saved.")}>
            <div><h2 className="text-xl font-semibold">Record consultation</h2><p className="mt-1 text-sm text-slate-600">The patient must be selected and assigned to your account.</p></div>
            <label className="block text-sm font-medium">Symptoms<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="symptoms" rows={2} maxLength={5000} /></label>
            <label className="block text-sm font-medium">Diagnosis<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="diagnosis" rows={2} maxLength={5000} /></label>
            <label className="block text-sm font-medium">Notes<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="notes" rows={2} maxLength={5000} /></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy || !patientCode}>{busy ? "Saving..." : "Save consultation"}</button>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/doctor/consultations/" + consultationId + "/prescriptions", (values) => ({ instructions: values.instructions, items: [{ medicineName: values.medicineName, dosage: values.dosage, frequency: values.frequency, duration: values.duration, instructions: values.itemInstructions }] }), "Prescription saved.")}>
            <div><h2 className="text-xl font-semibold">Create prescription</h2><p className="mt-1 text-sm text-slate-600">Select one of this patient's consultations.</p></div>
            <label className="block text-sm font-medium">Consultation<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={consultationId} onChange={(event) => setConsultationId(event.target.value)} required><option value="">Select a consultation</option>{consultations.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.diagnosis || "Consultation"}</option>)}</select></label>
            <label className="block text-sm font-medium">Medicine name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="medicineName" maxLength={200} required /></label>
            <label className="block text-sm font-medium">Dosage<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="dosage" maxLength={100} required /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Frequency<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="frequency" maxLength={100} /></label><label className="block text-sm font-medium">Duration<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="duration" maxLength={100} /></label></div>
            <label className="block text-sm font-medium">Prescription instructions<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="instructions" rows={2} maxLength={5000} /></label>
            <label className="block text-sm font-medium">Medicine instructions<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="itemInstructions" rows={2} maxLength={5000} /></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy || !consultationId}>{busy ? "Saving..." : "Save prescription"}</button>
          </form>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => submitForm(event, "/doctor/referrals", (values) => ({ ...values, patientCode, consultationId: values.consultationId || null }), "Referral sent.")}>
            <div><h2 className="text-xl font-semibold">Refer to another doctor</h2><p className="mt-1 text-sm text-slate-600">The receiving doctor gets record access only after accepting.</p></div>
            <label className="block text-sm font-medium">Receiving doctor<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="receivingDoctorUserId" required defaultValue=""><option value="" disabled>Select a doctor</option>{referralDoctors.map((item) => <option key={item.userId} value={item.userId}>{item.fullName} · {item.specialty}</option>)}</select></label>
            <label className="block text-sm font-medium">Related consultation (optional)<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="consultationId" defaultValue=""><option value="">No linked consultation</option>{consultations.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.diagnosis || "Consultation"}</option>)}</select></label>
            <label className="block text-sm font-medium">Referral reason<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="reason" rows={4} minLength={5} maxLength={5000} required /></label>
            <button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="submit" disabled={busy || !patientCode || !referralDoctors.length}>{busy ? "Sending..." : "Send referral"}</button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Referral inbox</h2>
          {referrals.length === 0 ? <p className="mt-3 text-slate-600">No referrals are waiting for your review.</p> : <div className="mt-4 space-y-3">{referrals.map((referral) => <article className="rounded-xl border border-slate-200 p-4" key={referral.referralId}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{referral.patientName} · {referral.patientCode}</h3><span className="text-sm font-semibold">{referral.status}</span></div><p className="mt-1 text-sm text-slate-600">From {referral.referringDoctor}</p><p className="mt-3">{referral.reason}</p><div className="mt-4 flex flex-wrap gap-2">{referral.status === "PENDING" && <button className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="button" disabled={busy} onClick={() => updateReferral(referral.referralId, "ACCEPTED")}>Accept</button>}{referral.status === "ACCEPTED" && <button className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="button" disabled={busy} onClick={() => updateReferral(referral.referralId, "COMPLETED")}>Mark completed</button>}<button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="button" disabled={busy} onClick={() => updateReferral(referral.referralId, "CANCELLED")}>Cancel</button></div></article>)}</div>}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default DoctorDashboard;
