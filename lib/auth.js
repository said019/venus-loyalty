// lib/auth.js
import jwt from "jsonwebtoken";
import "dotenv/config";

const COOKIE_NAME = "adm";

export function signAdmin(user) {
  return jwt.sign(
    { uid: user.id, email: user.email },
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
    req.admin = payload; // { uid, email, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}