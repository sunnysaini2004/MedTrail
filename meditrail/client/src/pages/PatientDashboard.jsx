
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { apiRequest } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { formatBloodGroup } from "../lib/bloodGroup.js";

function formatActivityDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function PatientDashboard() {
  const { user, refreshUser } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");
      try {
        const result = await apiRequest("/patient/dashboard");
        if (active) setDashboard(result);
      } catch (requestError) {
        if (requestError.status === 401) {
          await refreshUser();
        } else if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [refreshUser]);

  const activities = dashboard?.activities || [];

  return (
    <div className="app">
      <Navbar />

      <main className="dashboard">
        <section className="dashboard-welcome">
          <p className="eyebrow">PATIENT PORTAL</p>

          <h1>Welcome back, {user?.fullName}</h1>

          <p>
            Your healthcare journey, organized in one connected place.
          </p>

          <div className="dashboard-patient-id">
            Patient ID: <strong>{dashboard?.patient.patientCode || user?.patientCode || "Loading..."}</strong>
            <span className="ml-3 text-sm text-slate-600">
              Blood group: {formatBloodGroup(dashboard?.patient.bloodGroup)}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Assigned doctor: <strong className="text-slate-900">{dashboard?.assignedDoctor ? `${dashboard.assignedDoctor.fullName} · ${dashboard.assignedDoctor.specialty}` : "Not assigned yet"}</strong>
          </p>
        </section>

        <section className="dashboard-summary" aria-label="Patient summary">
          <article className="dashboard-card">
            <p className="dashboard-card-label">Patient ID</p>
            <h2>{dashboard?.patient.patientCode || user?.patientCode || "—"}</h2>
            <p>Your patient identifier</p>
          </article>

          <article className="dashboard-card">
            <p className="dashboard-card-label">Consultations</p>
            <h2>{dashboard?.summary.consultationCount ?? "—"}</h2>
            <p>Records in your account</p>
          </article>

          <article className="dashboard-card">
            <p className="dashboard-card-label">Prescriptions</p>
            <h2>{dashboard?.summary.prescriptionCount ?? "—"}</h2>
            <p>Linked to your consultations</p>
          </article>

          <article className="dashboard-card">
            <p className="dashboard-card-label">Pending Referrals</p>
            <h2>{dashboard?.summary.pendingReferralCount ?? "—"}</h2>
            <p>Waiting for review</p>
          </article>
        </section>

        <section className="dashboard-activity">
          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">YOUR CARE HISTORY</p>
              <h2>Recent Treatment Activity</h2>
            </div>
          </div>

          {loading && <p aria-live="polite">Loading your treatment history...</p>}
          {error && <p className="text-red-700" role="alert">{error}</p>}
          {!loading && !error && activities.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
              There are no consultation, prescription, or referral records yet.
            </p>
          )}

          <div className="dashboard-timeline">
            {activities.map((activity) => (
              <article
                className="timeline-item"
                key={activity.activityType + "-" + activity.recordId}
              >
                <div className="timeline-marker" aria-hidden="true" />

                <div className="timeline-content">
                  <div className="timeline-meta">
                    <span>{activity.activityType}</span>
                    <time dateTime={activity.activityDate}>{formatActivityDate(activity.activityDate)}</time>
                  </div>

                  <h3>{activity.title}</h3>

                  <p>{activity.description}</p>

                  <span className="timeline-status">
                    {activity.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-next-steps">
          <h2>Continue your healthcare journey</h2>

          <p>
            Your treatment history is loaded from your account and updated by
            authorized doctors. Document storage is planned for a future phase.
          </p>
        </section>

        <p className="dashboard-disclaimer">
          Academic prototype only. All patient information shown here is
          synthetic demo data and must not be used for clinical decisions.
        </p>
      </main>

      <Footer />
    </div>
  );
}

export default PatientDashboard;
