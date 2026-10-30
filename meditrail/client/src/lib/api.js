const defaultApiBaseUrl = import.meta.env.PROD
  ? "/api/v1"
  : "http://localhost:5000/api/v1";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
).replace(/\/+$/, "");

if (import.meta.env.PROD && API_BASE_URL !== "/api/v1") {
  throw new Error("Production API requests must use the same-origin /api/v1 proxy.");
}

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach MediTrail. Check that the server is running.");
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Keep a generic error when the server does not return JSON.
  }

  if (!response.ok) {
    const routeHint = response.status === 404
      ? " Requested: " + (options.method || "GET") + " " + API_BASE_URL + path + "."
      : "";
    const serverVersionHint = response.status === 404 && payload.message === "API route not found"
      ? " The backend may be an older MediTrail process; restart it from the current meditrail/server folder."
      : "";
    throw new ApiError(
      (payload.message || "The request could not be completed.") + routeHint + serverVersionHint,
      response.status
    );
  }

  return payload;
}
