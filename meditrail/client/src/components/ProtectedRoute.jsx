import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getRoleHomePath } from "../lib/roleRoutes.js";

function ProtectedRoute({ children, allowedRoles = ["PATIENT"] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-[50vh] px-6 py-16 text-center text-slate-600" aria-live="polite">
        Checking your session...
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;
