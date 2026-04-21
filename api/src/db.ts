import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

export const sql = postgres(connectionString, { max: 10 });

export async function withUser<T>(userId: string, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
