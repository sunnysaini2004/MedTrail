import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { getRoleLoginPath } from "../lib/roleRoutes.js";
import { apiRequest } from "../lib/api.js";

const loginOptions = [
  { role: "ADMIN", name: "Admin", description: "Manage patient and doctor accounts.", color: "border-teal-200 bg-teal-50 text-teal-900" },
  { role: "DOCTOR", name: "Doctor", description: "Open your assigned patients and care notes.", color: "border-blue-200 bg-blue-50 text-blue-900" },
  { role: "PATIENT", name: "Patient", description: "View your own treatment history.", color: "border-violet-200 bg-violet-50 text-violet-900" },
];


function Home() {
  const [hospitalSettings, setHospitalSettings] = useState(null);
  const [contactLoading, setContactLoading] = useState(true);
  const [contactError, setContactError] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest("/public/hospital-settings")
      .then((result) => { if (active) setHospitalSettings(result.settings || null); })
      .catch(() => { if (active) setContactError(true); })
      .finally(() => { if (active) setContactLoading(false); });
    return () => { active = false; };
  }, []);

  const phoneLink = hospitalSettings?.contactPhone?.replace(/[^+\d]/g, "");

  return (
    <div className="app">
      
        <Navbar />
      

      <main>
        <section className="hero" id="home">
          <p className="eyebrow">CONNECTED CARE, SIMPLIFIED</p>

          <h1>
            One Patient.
            <br />
            One Connected <span>Treatment Journey.</span>
          </h1>

          <p className="hero-description">
            Keep consultations, prescriptions, referrals, and medical
            documents connected in one organized place.
          </p>

          <div className="hero-actions">
            <Link className="button button-primary" to="/register">
              Get Started
            </Link>

            <a className="button button-secondary" href="#about">
              Learn More
            </a>
          </div>

          <p className="demo-note">
            Academic project demo — not for real clinical use.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14 sm:px-8" id="login-options">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">CHOOSE YOUR ACCOUNT</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Sign in to your MediTrail workspace</h2>
            <p className="mt-3 text-slate-600">Each account type opens its own dashboard.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {loginOptions.map((option) => (
              <article key={option.role} className={`rounded-2xl border p-6 shadow-sm ${option.color}`}>
                <p className="text-xs font-bold uppercase tracking-[0.18em]">{option.name} workspace</p>
                <h3 className="mt-3 text-2xl font-semibold">Login as {option.name}</h3>
                <p className="mt-2 min-h-12 text-sm text-slate-600">{option.description}</p>
                <Link
                  className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-white px-4 font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                  to={getRoleLoginPath(option.role)}
                >
                  Continue as {option.name}
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">
            New patient? <Link className="font-semibold text-teal-700 underline" to="/register">Create a patient account</Link>
          </p>
        </section>

        <section className="services" id="services">
          <p className="eyebrow">WHAT MEDTRAIL OFFERS</p>
          <h2>Your healthcare journey, organized.</h2>

          <div className="service-grid">
            <article className="service-card">
              <span className="service-icon">01</span>
              <h3>Patient Records</h3>
              <p>
                Keep permitted patient information organized and accessible.
              </p>
            </article>

            <article className="service-card">
              <span className="service-icon">02</span>
              <h3>Consultations</h3>
              <p>
                Maintain a chronological record of consultations and care.
              </p>
            </article>

            <article className="service-card">
              <span className="service-icon">03</span>
              <h3>Referrals</h3>
              <p>
                Help authorized doctors coordinate a patient's next steps.
              </p>
            </article>
          </div>
        </section>

        <section className="about home-about" id="about">
          <p className="eyebrow">ABOUT MEDTRAIL</p>
          <h2>Healthcare Records. Connected Care.</h2>
          <p className="home-about-description">
            MediTrail brings patient records, consultations, prescriptions, and
            medical referrals together in one organized digital platform —
            helping patients and authorized doctors stay connected throughout
            the treatment journey.
          </p>
        </section>

        <section className="contact" id="contact">
          <p className="eyebrow">HOSPITAL INFORMATION</p>
          <h2>{hospitalSettings?.hospitalName || "Contact and visit us"}</h2>
          {contactLoading ? <p aria-live="polite">Loading hospital contact details...</p> : contactError ? (
            <p role="status">Hospital contact details are temporarily unavailable.</p>
          ) : hospitalSettings ? (
            <div className="mt-5 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
              {hospitalSettings.officialEmail && <p className="break-words"><strong>Email:</strong> <a className="text-teal-700 underline" href={`mailto:${hospitalSettings.officialEmail}`}>{hospitalSettings.officialEmail}</a></p>}
              {hospitalSettings.contactPhone && <p><strong>Phone:</strong> <a className="text-teal-700 underline" href={`tel:${phoneLink}`}>{hospitalSettings.contactPhone}</a></p>}
              {hospitalSettings.address && <p className="whitespace-pre-line sm:col-span-2"><strong>Address:</strong> {hospitalSettings.address}</p>}
              {hospitalSettings.workingHours && <p className="whitespace-pre-line sm:col-span-2"><strong>Working hours:</strong> {hospitalSettings.workingHours}</p>}
            </div>
          ) : (
            <p>Hospital contact details have not been configured yet.</p>
          )}
        </section>
      </main>

      <Footer />

    </div>
  );
}

export default Home;
