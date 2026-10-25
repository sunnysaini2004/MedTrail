import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, authError } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const credentials = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const user = await login(credentials);
      const roleHome = user.role === "ADMIN" ? "/admin" : user.role === "DOCTOR" ? "/doctor" : "/dashboard";
      const destination = location.state?.from?.pathname || roleHome;
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <Navbar />
      <main>
        <section className="about">
          <p className="eyebrow">WELCOME BACK</p>

          <h2>Login to MediTrail</h2>

          <p>Continue your connected healthcare journey.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                maxLength={255}
                required
              />
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                maxLength={72}
                required
              />
            </div>

            {(error || authError) && <p className="text-sm text-red-700" role="alert">{error || authError}</p>}

            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? "Logging in..." : "Login"}
            </button>
          </form>

          <p>
            Don't have an account? <Link to="/register">Create an account</Link>
          </p>

          <p className="demo-note">
            Academic project demo. Use synthetic credentials only.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Login;
