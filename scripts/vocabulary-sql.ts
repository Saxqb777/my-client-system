/**
 * Prints the vocabulary seed as SQL statements for the Neon connector.
 * Usage: tsx scripts/vocabulary-sql.ts clients.json people.json > out.json
 * Both inputs are JSON arrays with the shapes buildVocabularySeed expects. Existing terms are never overwritten.
 */
import fs from "node:fs";
import { buildVocabularySeed } from "../src/lib/data/vocabulary";

const [clientsFile, peopleFile] = process.argv.slice(2);
const clients = JSON.parse(fs.readFileSync(clientsFile, "utf8"));
const people = JSON.parse(fs.readFileSync(peopleFile, "utf8"));
const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const rows = buildVocabularySeed(clients, people);
const values = rows.map((r) => `(${lit(r.term)}, ${lit(r.type)}, ${lit(r.meaning)}, ${r.clientId ? `${lit(r.clientId)}::uuid` : "NULL"})`).join(",\n");
const sql = `INSERT INTO vocabulary (term, type, meaning, client_id) VALUES\n${values}\nON CONFLICT (lower(term)) DO NOTHING`;
process.stdout.write(JSON.stringify([sql]));
console.error(`${rows.length} terms`);
