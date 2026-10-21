import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, callRpc, type TestDb } from "./harness";

let db: TestDb;
let alice: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, "alice@example.com", "Alice");
});
afterAll(async () => {
  await db.close();
});

describe("smoke", () => {
  it("migrazioni applicate", async () => {
    const r = await db.query<{ count: string }>(
      "select count(*)::text as count from app_private.question_bank"
    );
    expect(Number(r.rows[0].count)).toBeGreaterThan(100);
  });
  it("crea stanza", async () => {
    const res = await callRpc<Record<string, unknown>>(db, alice, "create_room", [
      "Stanza Test",
      "capital",
      "easy",
      5,
      4,
      20,
    ]);
    expect(res.error).toBeNull();
    expect(res.data).toBeTruthy();
  });
});
