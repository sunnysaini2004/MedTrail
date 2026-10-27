
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getRoleHomePath } from "../lib/roleRoutes.js";

function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === "/";
  const workspacePath = getRoleHomePath(user?.role);

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <header className="navbar">
      <Link className="brand" to="/">
        <span className="brand-icon">M</span>
        MediTrail
      </Link>

      <button
        className="navbar-menu-button"
        type="button"
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={menuOpen}
        aria-controls="main-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
      </button>

      <nav id="main-navigation" className={menuOpen ? "navbar-menu open" : "navbar-menu"} aria-label="Main navigation">
        {isHome ? (
          <>
            <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
            <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
            <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
            {user && <Link to={workspacePath} onClick={() => setMenuOpen(false)}>Workspace</Link>}
          </>
        ) : (
          <>
            <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
            {user && <Link to={workspacePath} onClick={() => setMenuOpen(false)}>Workspace</Link>}
          </>
        )}
      </nav>

      <div className="navbar-actions">
      {user ? (
        <button className="login-link border-0 bg-transparent p-0" type="button" onClick={handleLogout}>
          Log out
        </button>
      ) : pathname === "/login" ? (
        <Link className="login-link" to="/register">
          Register
        </Link>
      ) : (
        <Link className="login-link" to="/login">
          Login
        </Link>
      )}
      </div>
      {logoutError && <span className="text-sm text-red-700" role="alert">{logoutError}</span>}
    </header>
  );
}

export default Navbar;
