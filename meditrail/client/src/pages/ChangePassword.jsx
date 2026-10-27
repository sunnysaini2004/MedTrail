import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer.jsx";
import Navbar from "../components/Navbar.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getRoleHomePath } from "../lib/roleRoutes.js";

function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const updatedUser = await changePassword(values);
      navigate(getRoleHomePath(updatedUser.role), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <Navbar />
      <main>
        <section className="about">
          <p className="eyebrow">ACCOUNT SECURITY</p>
          <h1>Choose a new password</h1>
          <p>Your administrator gave you a temporary password. Set a password you will remember before opening your dashboard.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="text-sm text-slate-600">Account: <strong>{user?.email}</strong></p>
            <div>
              <label htmlFor="password">New password</label>
              <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} required />
              <p className="text-xs text-slate-500">Use at least 8 characters.</p>
            </div>
            <div>
              <label htmlFor="confirmPassword">Confirm new password</label>
              <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={72} required />
            </div>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save new password"}</button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default ChangePassword;
