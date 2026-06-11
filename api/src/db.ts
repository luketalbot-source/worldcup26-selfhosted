import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

// Pool tuned after the 2026-06-11 incident:
//   max 10 + no connect_timeout caused concurrent leaderboard requests and the
//   background match-sync to exhaust the pool; when postgres restarted, every
//   queued request sat until nginx's 60s proxy_read_timeout fired (504s).
// max 25: postgres max_connections is 100 and we run a single API instance —
//   25 gives comfortable headroom without over-provisioning.
// idle_timeout 20s: release connections that have been idle so the pool
//   doesn't hold open sockets unnecessarily between request bursts.
// connect_timeout 10s: fail fast when the DB is down or restarting so the API
//   returns a 5xx immediately rather than queuing past nginx's 60s timeout.
export const sql = postgres(connectionString, {
  max: 25,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function withUser<T>(userId: string, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
