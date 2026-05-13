// lib/auth.js
import jwt from "jsonwebtoken";
import "dotenv/config";

const COOKIE_NAME = "adm";

export function signAdmin(user) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      role: user.role || "admin"
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function setAdminCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,        // en Render es true
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function adminAuth(req, res, next) {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: "auth_required" });
    const payload = jwt.verify(raw, process.env.ADMIN_JWT_SECRET);
    req.admin = {
      uid: payload.uid,
      email: payload.email,
      role: payload.role || "admin"
    };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin || !allowed.includes(req.admin.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}