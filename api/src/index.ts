import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profiles";
import predictionRoutes from "./routes/predictions";
import leagueRoutes from "./routes/leagues";
import matchRoutes from "./routes/matches";
import boostRoutes from "./routes/boosts";
import customBoostRoutes from "./routes/custom-boosts";
import leaderboardRoutes from "./routes/leaderboard";
import tenantRoutes from "./routes/tenants";
import adminRoutes from "./routes/admin";
import rpcRoutes from "./routes/rpc";
import wc2026Routes from "./routes/wc2026";

const app = new Hono();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map(s => s.trim());

app.use("*", cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.get("/health", (c) => c.json({ status: "ok" }));

// Public config endpoint — tells the frontend whether dev mode is on, so it
// can conditionally show "enter without SSO" buttons. Safe to expose: only
// returns booleans derived from server env, plus a public deploy label.
//
// The `deployment` block exists because we can run identical code on
// multiple Northflank projects (e.g. legacy `wc2026` + new `football-2026`
// during a registry migration). Each project sets DEPLOY_LABEL in its
// runtime env so a request to /api/config tells you exactly which
// instance answered. Falls back to "unknown" so the field is always
// present.
app.get("/api/config", (c) => c.json({
  devMode: process.env.ADMIN_OPEN === "1",
  deployment: {
    label: process.env.DEPLOY_LABEL ?? "unknown",
  },
}));

app.route("/api/auth", authRoutes);
app.route("/api/profiles", profileRoutes);
app.route("/api/predictions", predictionRoutes);
app.route("/api/leagues", leagueRoutes);
app.route("/api/matches", matchRoutes);
app.route("/api/boosts", boostRoutes);
app.route("/api/custom-boosts", customBoostRoutes);
app.route("/api/leaderboard", leaderboardRoutes);
app.route("/api/tenants", tenantRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/rpc", rpcRoutes);
app.route("/api/wc2026", wc2026Routes);

export default {
  port: parseInt(process.env.PORT ?? "3000"),
  fetch: app.fetch,
};
