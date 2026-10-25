const EMAIL_LOCAL_PART = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;

function isGmailAddress(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  return normalized.length <= 254 &&
    localPart.length > 0 && localPart.length <= 64 &&
    EMAIL_LOCAL_PART.test(localPart) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..") &&
    domain.toLowerCase() === "gmail.com";
}

module.exports = { isGmailAddress };
