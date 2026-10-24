
function App() {
  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">M</span>
          MediTrail
        </a>

        <nav aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#about">About</a>
          <a href="#services">Services</a>
          <a href="#contact">Contact</a>
        </nav>

        <a className="login-link" href="#login">
          Login
        </a>
      </header>

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
            <a className="button button-primary" href="#register">
              Get Started
            </a>
            <a className="button button-secondary" href="#about">
              Learn More
            </a>
          </div>

          <p className="demo-note">
            Academic project demo — not for real clinical use.
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

        <section className="about" id="about">
          <p className="eyebrow">ABOUT MEDTRAIL</p>
          <h2>Less paperwork. A clearer treatment journey.</h2>
          <p>
            MediTrail is an academic project concept designed to connect
            patient records and authorized healthcare workflows.
          </p>
        </section>

        <section className="contact" id="contact">
          <h2>Building a connected care experience.</h2>
          <p>
            Patient registration, secure login, and clinical workflows will
            be implemented in upcoming development phases.
          </p>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#home">
          <span className="brand-icon">M</span>
          MediTrail
        </a>
        <p>One Patient. One Connected Treatment Journey.</p>
        <p>Academic prototype · Synthetic demo data only</p>
      </footer>
    </div>
  );
}

export default App;
