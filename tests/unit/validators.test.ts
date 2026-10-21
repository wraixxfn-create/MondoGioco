import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  emailSchema,
  createRoomSchema,
  joinRoomSchema,
  playerAnswerSchema,
  geoCoordinatesSchema,
} from "@/lib/validators";

describe("geoCoordinatesSchema", () => {
  it("accetta coordinate valide", () => {
    const result = geoCoordinatesSchema.safeParse({ lat: 41.9, lng: 12.5 });
    expect(result.success).toBe(true);
  });

  it("rifiuta latitudine fuori range", () => {
    const result = geoCoordinatesSchema.safeParse({ lat: 91, lng: 0 });
    expect(result.success).toBe(false);
  });

  it("rifiuta longitudine fuori range", () => {
    const result = geoCoordinatesSchema.safeParse({ lat: 0, lng: 181 });
    expect(result.success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("accetta username validi", () => {
    expect(usernameSchema.safeParse("Giocatore123").success).toBe(true);
    expect(usernameSchema.safeParse("test_user").success).toBe(true);
    expect(usernameSchema.safeParse("abc").success).toBe(true);
  });

  it("rifiuta username troppo corti", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rifiuta username troppo lunghi", () => {
    expect(usernameSchema.safeParse("a".repeat(25)).success).toBe(false);
  });

  it("rifiuta caratteri speciali", () => {
    expect(usernameSchema.safeParse("user@name").success).toBe(false);
    expect(usernameSchema.safeParse("user name").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("accetta email valide", () => {
    expect(emailSchema.safeParse("test@example.com").success).toBe(true);
  });

  it("rifiuta email non valide", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("@missing.com").success).toBe(false);
  });
});

describe("createRoomSchema", () => {
  it("accetta input validi", () => {
    const result = createRoomSchema.safeParse({
      name: "La mia stanza",
      quizType: "capital",
      difficulty: "easy",
      maxPlayers: 4,
      totalQuestions: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta maxPlayers fuori range", () => {
    const result = createRoomSchema.safeParse({
      name: "Test",
      quizType: "capital",
      difficulty: "easy",
      maxPlayers: 10,
      totalQuestions: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta quizType non valido", () => {
    const result = createRoomSchema.safeParse({
      name: "Test",
      quizType: "invalid",
      difficulty: "easy",
      maxPlayers: 4,
      totalQuestions: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("joinRoomSchema", () => {
  it("accetta codici validi di 6 caratteri", () => {
    expect(joinRoomSchema.safeParse({ code: "ABC123" }).success).toBe(true);
  });

  it("rifiuta codici di lunghezza errata", () => {
    expect(joinRoomSchema.safeParse({ code: "AB12" }).success).toBe(false);
  });
});

describe("playerAnswerSchema", () => {
  it("accetta risposte valide", () => {
    const result = playerAnswerSchema.safeParse({
      questionId: "550e8400-e29b-41d4-a716-446655440000",
      answer: "Roma",
      timeSpent: 5.5,
      isCorrect: true,
      points: 150,
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta punti negativi", () => {
    const result = playerAnswerSchema.safeParse({
      questionId: "550e8400-e29b-41d4-a716-446655440000",
      answer: "Roma",
      timeSpent: 5.5,
      isCorrect: true,
      points: -10,
    });
    expect(result.success).toBe(false);
  });
});
