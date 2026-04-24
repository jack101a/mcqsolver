import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const workspaceArg = ["--workspace", "@autofill/api"];

const run = (label, args) => {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(npmCommand, args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    env: process.env
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result.status === 0;
};

const main = () => {
  const preflightOk = run("DR Preflight", ["run", "dr:preflight", ...workspaceArg]);
  if (!preflightOk) {
    process.stdout.write(
      "\nDR orchestration stopped: PostgreSQL is not reachable. Start DB or set DATABASE_URL, then rerun.\n"
    );
    process.exitCode = 1;
    return;
  }

  const drillOk = run("DR Restore Drill", ["run", "dr:restore-drill", ...workspaceArg]);
  if (!drillOk) {
    process.stdout.write("\nDR restore drill failed. Fix database state/connectivity and rerun.\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write("\nDR orchestration completed successfully.\n");
};

main();
