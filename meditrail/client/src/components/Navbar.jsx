
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const isHome = pathname === "/";
  const workspacePath = user?.role === "ADMIN" ? "/admin" : user?.role === "DOCTOR" ? "/doctor" : "/dashboard";

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

      <nav aria-label="Main navigation">
        {isHome ? (
          <>
            <a href="#home">Home</a>
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#contact">Contact</a>
            {user && <Link to={workspacePath}>Workspace</Link>}
          </>
        ) : (
          <>
            <Link to="/">Home</Link>
            {user && <Link to={workspacePath}>Workspace</Link>}
          </>
        )}
      </nav>

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
      {logoutError && <span className="text-sm text-red-700" role="alert">{logoutError}</span>}
    </header>
  );
}

export default Navbar;
