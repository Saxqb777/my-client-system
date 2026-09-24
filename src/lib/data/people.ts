import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, type Person } from "@/lib/db/schema";
import type { PersonInput } from "@/lib/validation";

export async function createPerson(input: PersonInput): Promise<Person> {
  const db = await getDb();
  const [row] = await db.insert(people).values(input).returning();
  return row;
}

export async function updatePerson(id: string, patch: Partial<PersonInput>): Promise<Person> {
  const db = await getDb();
  const [row] = await db.update(people).set(patch).where(eq(people.id, id)).returning();
  return row;
}

export async function deletePerson(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(people).where(eq(people.id, id));
}
