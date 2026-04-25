import pg from "pg";

const { Pool } = pg;

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("BEGIN");
    await pool.query("TRUNCATE TABLE incident_metrics_hourly");
    await pool.query(
      `INSERT INTO incident_metrics_hourly (bucket_start, type, severity, source, count)
       SELECT date_trunc('hour', created_at) AS bucket_start, type, severity, source, COUNT(*)::int AS count
       FROM alert_events
       GROUP BY 1, 2, 3, 4`
    );
    await pool.query("COMMIT");
    console.log("Incident metrics rebuild completed.");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
