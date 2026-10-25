const ROLE_HOME_PATHS = Object.freeze({
  PATIENT: "/dashboard",
  DOCTOR: "/doctor",
  ADMIN: "/admin",
});

const ROLE_LOGIN_SLUGS = Object.freeze({
  PATIENT: "patient",
  DOCTOR: "doctor",
  ADMIN: "admin",
});

const LOGIN_SLUG_ROLES = Object.freeze({
  patient: "PATIENT",
  doctor: "DOCTOR",
  admin: "ADMIN",
});

export function getRoleHomePath(role) {
  return ROLE_HOME_PATHS[role] || "/";
}

export function canRoleAccessPath(role, path) {
  return ROLE_HOME_PATHS[role] === path;
}

export function getRoleLoginPath(role) {
  const slug = ROLE_LOGIN_SLUGS[role];
  return slug ? "/login/" + slug : "/login";
}

export function getRoleFromLoginSlug(slug) {
  return LOGIN_SLUG_ROLES[String(slug || "").toLowerCase()] || null;
}

export function getRoleLabel(role) {
  return role === "ADMIN" ? "Admin" : role === "DOCTOR" ? "Doctor" : role === "PATIENT" ? "Patient" : "";
}
