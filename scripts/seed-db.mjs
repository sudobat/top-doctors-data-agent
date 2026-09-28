import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const broken = process.argv.includes("--broken");

const sqlParts = [
  readFileSync(join(root, "db/schema.sql"), "utf8"),
  readFileSync(join(root, "db/seed.sql"), "utf8"),
];

if (broken) {
  sqlParts.push(readFileSync(join(root, "db/seed-pipeline-errors.sql"), "utf8"));
}

const sql = sqlParts.join("\n");

const user = process.env.POSTGRES_USER ?? "clinic";
const db = process.env.POSTGRES_DB ?? "clinic";

const result = spawnSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1"],
  {
    cwd: root,
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) === 0) {
  console.log(broken ? "Seeded clinic DB with pipeline-error scenarios." : "Seeded clinic DB (healthy).");
}

process.exit(result.status ?? 1);
