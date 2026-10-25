const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

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
    throw new ApiError(
      payload.message || "The request could not be completed.",
      response.status
    );
  }

  return payload;
}
