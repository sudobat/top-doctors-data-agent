import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = [
  readFileSync(join(root, "db/schema.sql"), "utf8"),
  readFileSync(join(root, "db/seed.sql"), "utf8"),
].join("\n");

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

process.exit(result.status ?? 1);
