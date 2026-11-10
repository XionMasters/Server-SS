// src/app/matches/ai/aiBot.ts
// Identidad del rival controlado por el servidor (partidas Jugador vs IA).
//
// matches.player2_id y player2_deck_id son claves foráneas, así que la IA es un usuario de
// sistema de verdad (sin contraseña utilizable). Su id es fijo para poder reconocerla sin
// consultar la base de datos (recuperación de partida al reconectar, ejecución de turnos…).

export const AI_BOT_USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const AI_BOT_USERNAME = 'IA Cósmica';
export const AI_BOT_EMAIL = 'ia@caballeros-cosmicos.invalid';

/** Rival del autojuego (scripts/aiSelfPlay.ts): otro usuario de sistema, controlado por la misma IA. */
export const AI_SPARRING_USER_ID = '00000000-0000-4000-8000-0000000000a2';

/** Usuarios de sistema que no son jugadores (los scripts de datos los ignoran). */
export const AI_SYSTEM_USER_IDS = [AI_BOT_USER_ID, AI_SPARRING_USER_ID];

/** True si el usuario es la IA del servidor. */
export function isAiBot(userId: string | null | undefined): boolean {
  return userId === AI_BOT_USER_ID;
}
