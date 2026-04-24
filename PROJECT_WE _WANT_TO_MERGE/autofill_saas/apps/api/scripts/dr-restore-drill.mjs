import pg from "pg";

const { Pool } = pg;

const requiredTables = [
  "users",
  "devices",
  "subscriptions",
  "profiles",
  "workflows",
  "workflow_runs",
  "sync_state",
  "audit_events",
  "alert_events"
];

const safeIdentifier = (name) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return `"${name}"`;
};

const countRows = async (client, schema, table) => {
  const schemaId = safeIdentifier(schema);
  const tableId = safeIdentifier(table);
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${schemaId}.${tableId}`);
  return result.rows[0]?.count ?? 0;
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for DR restore drill.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const restoreSchema = `dr_restore_${Date.now()}`;
  const restoreSchemaId = safeIdentifier(restoreSchema);

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${restoreSchemaId}`);

    for (const table of requiredTables) {
      const tableId = safeIdentifier(table);
      await client.query(`CREATE TABLE ${restoreSchemaId}.${tableId} AS TABLE public.${tableId} WITH DATA`);
    }

    const comparisons = [];
    for (const table of requiredTables) {
      const sourceCount = await countRows(client, "public", table);
      const restoredCount = await countRows(client, restoreSchema, table);
      comparisons.push({
        table,
        sourceCount,
        restoredCount,
        matched: sourceCount === restoredCount
      });
    }

    const mismatches = comparisons.filter((item) => !item.matched);
    console.log(JSON.stringify({ restoreSchema, comparisons, mismatches: mismatches.length }, null, 2));

    await client.query(`DROP SCHEMA ${restoreSchemaId} CASCADE`);
    await client.query("COMMIT");

    if (mismatches.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error("DR restore drill failed:", error);
  process.exitCode = 1;
});
