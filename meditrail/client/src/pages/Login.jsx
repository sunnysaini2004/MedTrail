import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Footer from "../components/Footer.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  canRoleAccessPath,
  getRoleFromLoginSlug,
  getRoleHomePath,
  getRoleLabel,
  getRoleLoginPath,
} from "../lib/roleRoutes.js";

const loginRoles = ["ADMIN", "DOCTOR", "PATIENT"];

function RoleLoginSelection() {
  const location = useLocation();

  return (
    <div className="app">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="eyebrow text-center">SIGN IN</p>
        <h1 className="mt-2 text-center text-3xl font-bold text-slate-900">Choose your account type</h1>
        <p className="mt-3 text-center text-slate-600">You will only be able to sign in to the dashboard for your account.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {loginRoles.map((role) => (
            <Link
              key={role}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-teal-500 hover:shadow-md"
              to={getRoleLoginPath(role)}
              state={location.state}
            >
              <span className="text-xs font-bold tracking-[0.18em] text-teal-700">{getRoleLabel(role).toUpperCase()}</span>
              <span className="mt-2 block text-xl font-semibold text-slate-900">Login as {getRoleLabel(role)}</span>
              <span className="mt-2 block text-sm text-slate-600">Open the {getRoleHomePath(role)} workspace.</span>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-600">
          New patient? <Link className="font-semibold text-teal-700 underline" to="/register">Register here</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role: roleSlug } = useParams();
  const selectedRole = getRoleFromLoginSlug(roleSlug);
  const { login, authError } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const credentials = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      role: selectedRole,
    };
    try {
      const user = await login(credentials);
      if (user.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }
      const roleHome = getRoleHomePath(user.role);
      const requestedPath = location.state?.from?.pathname;
      const destination = canRoleAccessPath(user.role, requestedPath)
        ? requestedPath
        : roleHome;
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!selectedRole) return <RoleLoginSelection />;

  return (
    <div className="app">
      <Navbar />
      <main>
        <section className="about">
          <p className="eyebrow">WELCOME BACK</p>

          <h2>Login as {getRoleLabel(selectedRole)}</h2>

          <p>Use the Gmail address and password for your {getRoleLabel(selectedRole).toLowerCase()} account.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@gmail.com"
                autoCapitalize="none"
                autoComplete="email"
                maxLength={255}
                required
              />
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                name="password"
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

          <p className="text-center text-sm">
            <Link className="font-semibold text-teal-700 underline" to="/login" state={location.state}>Choose a different account type</Link>
          </p>

          {selectedRole === "PATIENT" && <p>Don't have an account? <Link to="/register">Create a patient account</Link></p>}

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
