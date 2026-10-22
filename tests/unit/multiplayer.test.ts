import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_SETTINGS,
  canStartGame,
  closedReasonLabel,
  describeMultiplayerError,
  getRememberedRoom,
  forgetActiveRoom,
  isHostAway,
  isMultiplayerAvailable,
  isValidRoomCode,
  mapTransportError,
  msRemaining,
  normalizeRoomCode,
  phaseLabel,
  rememberActiveRoom,
  subscribeToRoom,
  type RoomSnapshot,
} from "@/lib/services/multiplayer";

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    ok: true,
    server_time: new Date().toISOString(),
    room: {
      id: "room-1",
      code: "ABC234",
      name: "Test",
      host_id: "alice",
      quiz_type: "capital",
      difficulty: "easy",
      phase: "lobby",
      max_players: 6,
      total_rounds: 5,
      round_seconds: 20,
      current_round: 0,
      created_at: new Date().toISOString(),
      lobby_expires_at: new Date(Date.now() + 60_000).toISOString(),
      started_at: null,
      phase_started_at: new Date().toISOString(),
      round_started_at: null,
      round_ends_at: null,
      reveal_ends_at: null,
      finished_at: null,
      closed_at: null,
      closed_reason: null,
      version: 1,
    },
    me: {
      user_id: "alice",
      username: "Alice",
      is_host: true,
      is_ready: true,
      score: 0,
      correct_count: 0,
      answer_count: 0,
      connection: "connected",
      answered_current_round: false,
    },
    players: [
      {
        user_id: "alice",
        username: "Alice",
        is_host: true,
        is_ready: true,
        score: 0,
        correct_count: 0,
        answer_count: 0,
        connection: "connected",
        last_seen_at: new Date().toISOString(),
      },
      {
        user_id: "bob",
        username: "Bob",
        is_host: false,
        is_ready: true,
        score: 0,
        correct_count: 0,
        answer_count: 0,
        connection: "connected",
        last_seen_at: new Date().toISOString(),
      },
    ],
    standings: [],
    round: null,
    reveal: null,
    settings: {
      client_poll_ms: 3000,
      reveal_seconds: 8,
      answer_grace_ms: 1500,
      reconnect_grace_seconds: 90,
      host_handover_seconds: 180,
      min_players: 2,
      max_players_limit: 8,
      min_rounds: 3,
      max_rounds: 15,
      min_round_seconds: 10,
      max_round_seconds: 90,
    },
    ...overrides,
  };
}

describe("Multiplayer: configurazione e validazioni", () => {
  it("in assenza di variabili d'ambiente non dichiara il multiplayer disponibile", () => {
    expect(isMultiplayerAvailable()).toBe(false);
    expect(normalizeRoomCode("abc-234")).toBe("ABC234");
    expect(isValidRoomCode("ABC234")).toBe(true);
    expect(isValidRoomCode("ABC23")).toBe(false);
    expect(isValidRoomCode("ABCDEI")).toBe(false); // I ambigua, non ammessa
    expect(isValidRoomCode("ABCDE0")).toBe(false); // 0 ambigua, non ammessa
  });

  it("traduce gli errori del server in messaggi utili", () => {
    expect(describeMultiplayerError("MG409:duplicate_answer")).toMatch(/già risposto/i);
    expect(describeMultiplayerError("MG409:round_closed")).toMatch(/tempo scaduto/i);
    expect(describeMultiplayerError("MG403:host_only")).toMatch(/host/i);
    expect(describeMultiplayerError("MG404:room_not_found")).toMatch(/codice stanza/i);
    expect(describeMultiplayerError("sconosciuto")).toContain("sconosciuto");
    // Un blocco RLS è un problema di autorizzazione, non di rete.
    expect(mapTransportError("new row violates row-level security policy")).toBe(
      "MG403:permission_denied"
    );
    expect(mapTransportError("JWT expired")).toBe("SESSION");
    expect(mapTransportError("MG429:rate_limited")).toBe("MG429:rate_limited");
    expect(mapTransportError("permission denied for table game_rooms")).toBe(
      "MG403:permission_denied"
    );
  });

  it("non crea canali realtime senza configurazione", () => {
    const unsubscribe = subscribeToRoom("room-1", { onChange: () => {} });
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});

describe("Multiplayer: timer e stato", () => {
  it("calcola il tempo rimanente dai timestamp del server", () => {
    const now = Date.now();
    expect(msRemaining(new Date(now + 5_000).toISOString(), now)).toBe(5_000);
    expect(msRemaining(new Date(now - 5_000).toISOString(), now)).toBe(0);
    expect(msRemaining(null, now)).toBe(0);
    expect(msRemaining("non-una-data", now)).toBe(0);
  });

  it("etichetta fasi e motivi di chiusura", () => {
    expect(phaseLabel("lobby")).toBe("Lobby");
    expect(phaseLabel("round_reveal")).toBe("Soluzione");
    expect(closedReasonLabel("host_closed")).toMatch(/host/);
    expect(closedReasonLabel("abandoned")).toMatch(/abbandonata/);
  });

  it("ricorda la stanza attiva per la riconnessione e la dimentica su richiesta", () => {
    window.localStorage.clear();
    rememberActiveRoom("room-1", "ABC234");
    expect(getRememberedRoom()?.roomId).toBe("room-1");
    forgetActiveRoom();
    expect(getRememberedRoom()).toBeNull();
  });

  it("consente l'avvio solo all'host con tutti pronti e almeno due giocatori", () => {
    const ready = snapshot();
    expect(canStartGame(ready).allowed).toBe(true);

    const notHost = snapshot({
      me: { ...ready.me!, is_host: false },
    });
    expect(canStartGame(notHost).allowed).toBe(false);

    const notReady = snapshot({
      players: ready.players.map((player, index) =>
        index === 1 ? { ...player, is_ready: false } : player
      ),
    });
    expect(canStartGame(notReady).reason).toMatch(/pronti/i);

    const alone = snapshot({ players: [ready.players[0]] });
    expect(canStartGame(alone).reason).toMatch(/almeno 2/i);

    const hostAway = snapshot({
      players: ready.players.map((player, index) =>
        index === 0 ? { ...player, connection: "disconnected" } : player
      ),
    });
    expect(isHostAway(hostAway)).toBe(true);
  });

  it("espone limiti di default coerenti con il server", () => {
    expect(DEFAULT_GAME_SETTINGS.min_players).toBe(2);
    expect(DEFAULT_GAME_SETTINGS.max_players_limit).toBe(8);
    expect(DEFAULT_GAME_SETTINGS.client_poll_ms).toBeGreaterThanOrEqual(1000);
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("Globe: scelta delle texture", () => {
  it("usa la variante leggera senza normal map su mobile o con risparmio dati", async () => {
    const { pickTextureSet } = await import("@/components/globe/Globe");
    expect(pickTextureSet(390)).toEqual({
      day: "/textures/earth-day-1024.webp",
      normal: null,
    });
    expect(pickTextureSet(1440, true)).toEqual({
      day: "/textures/earth-day-1024.webp",
      normal: null,
    });
    expect(pickTextureSet(1440)).toEqual({
      day: "/textures/earth-day-2048.webp",
      normal: "/textures/earth-normal-1024.webp",
    });
  });
});
