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

export const quizTypeSchema = z.enum(["capital", "flag", "location", "population", "continent"]);

export const difficultySchema = z.enum(["easy", "medium", "hard"]);

/**
 * Validazione lato client delle stanze multiplayer.
 * Duplica intenzionalmente (in modo più permissivo) i vincoli del server:
 * la fonte di verità resta `public.create_room` in PostgreSQL.
 */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Il codice stanza deve avere 6 caratteri validi");

export const createRoomSchema = z.object({
  name: z.string().trim().min(3, "Il nome della stanza deve avere almeno 3 caratteri").max(40),
  quizType: z.enum(["capital", "flag", "continent", "population"]),
  difficulty: difficultySchema,
  maxPlayers: z.number().int().min(2).max(8),
  totalRounds: z.number().int().min(3).max(15),
  roundSeconds: z.number().int().min(10).max(90).optional(),
});

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
});

/**
 * Risposta inviata al server. NON contiene `isCorrect` né `points`: quei campi
 * sono calcolati esclusivamente da PostgreSQL (vedi `public.submit_answer`).
 */
export const playerAnswerSchema = z.object({
  roomId: z.string().uuid(),
  roundIndex: z.number().int().min(1),
  answer: z.string().trim().min(1).max(80),
});

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type PlayerAnswerInput = z.infer<typeof playerAnswerSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
