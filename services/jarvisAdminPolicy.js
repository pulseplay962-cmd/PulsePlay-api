export function isAuthorizedJarvisAdmin(user, env = process.env) {
  if (!user || typeof user.id !== "string") return false;
  const appMetadata = user.app_metadata || {};
  const roles = Array.isArray(appMetadata.roles) ? appMetadata.roles : [];
  if (appMetadata.role === "admin" || roles.includes("admin")) return true;

  const allowedUserIds = String(env.JARVIS_ADMIN_USER_IDS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const allowedEmails = String(env.JARVIS_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const email = String(user.email || "").trim().toLowerCase();

  return allowedUserIds.includes(user.id) || Boolean(email && allowedEmails.includes(email));
}
