import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const result = await apiRequest("/auth/me");
      setUser(result.user);
      setAuthError("");
      return result.user;
    } catch (error) {
      setUser(null);
      setAuthError(error.status === 401 ? "" : error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const createAccount = useCallback(async (details) => {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(details),
    });
    setUser(result.user);
    setAuthError("");
    return result.user;
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setUser(result.user);
    setAuthError("");
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, authError, refreshUser, createAccount, login, logout }),
    [user, loading, authError, refreshUser, createAccount, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
