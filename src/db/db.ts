import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { env } from "../config/env";

const dbPath = path.resolve(process.cwd(), env.databasePath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
