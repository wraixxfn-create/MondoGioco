import { z } from "zod";

// ============================================================
// Validatori Zod per MondoGioco
// ============================================================

export const geoCoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const usernameSchema = z
  .string()
  .min(3, "Il nome utente deve avere almeno 3 caratteri")
  .max(24, "Il nome utente non può superare i 24 caratteri")
  .regex(/^[a-zA-Z0-9_-]+$/, "Solo lettere, numeri, trattini e underscore");

export const emailSchema = z.string().email("Email non valida");

export const quizTypeSchema = z.enum([
  "capital",
  "flag",
  "location",
  "population",
  "continent",
]);

export const difficultySchema = z.enum(["easy", "medium", "hard"]);

export const createRoomSchema = z.object({
  name: z
    .string()
    .min(3, "Il nome della stanza deve avere almeno 3 caratteri")
    .max(50),
  quizType: quizTypeSchema,
  difficulty: difficultySchema,
  maxPlayers: z.number().int().min(2).max(8),
  totalQuestions: z.number().int().min(5).max(20),
});

export const joinRoomSchema = z.object({
  code: z
    .string()
    .length(6, "Il codice stanza deve avere 6 caratteri")
    .toUpperCase(),
});

export const playerAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string(),
  coordinates: geoCoordinatesSchema.optional(),
  timeSpent: z.number().positive(),
  isCorrect: z.boolean(),
  points: z.number().int().min(0),
});

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type PlayerAnswerInput = z.infer<typeof playerAnswerSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
