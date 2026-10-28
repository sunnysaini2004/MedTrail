export function formatBloodGroup(value) {
  if (!value) return "Not recorded";
  return value === "UNKNOWN" ? "Unknown / Not sure" : value;
}
