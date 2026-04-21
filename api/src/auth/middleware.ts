import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export type AuthEnv = {
  Variables: { user: JWTPayload };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWT_SECRET);
    c.set("user", payload as unknown as JWTPayload);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWT_SECRET);
    const p = payload as unknown as JWTPayload;
    if (p.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    c.set("user", p);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});
