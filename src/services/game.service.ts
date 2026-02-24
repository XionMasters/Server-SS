// src/services/game.service.ts
/**
 * GameService - Orquestador central de lógica de juego
 * 
 * DEPRECADO: Este servicio contiene endpoints REST legados.
 * Use WebSocket handlers en websocket.service.ts en su lugar.
 */

import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';

export class GameService {
  static async startTurn(matchId: string, playerNumber: number): Promise<Match | null> {
    throw new Error('Use WebSocket handler instead. REST endpoints deprecated for game actions.');
  }

  static async playCard(matchId: string, userId: string, cardInPlayId: string, position: number): Promise<any> {
    throw new Error('Use WebSocket "play_card" handler instead. REST endpoints deprecated for game actions.');
  }

  static async passTurn(matchId: string, userId: string): Promise<Match | null> {
    throw new Error('Use WebSocket "end_turn" handler instead. REST endpoints deprecated for game actions.');
  }

  static async startFirstTurn(matchId: string, userId: string): Promise<any> {
    throw new Error('Use WebSocket handler instead. REST endpoints deprecated for game actions.');
  }

  static async attackKnight(matchId: string, userId: string, attackerCardInPlayId: string, defenderCardInPlayId: string): Promise<any> {
    throw new Error('Use WebSocket "declare_attack" handler instead. REST endpoints deprecated for game actions.');
  }

  static async changeDefensiveMode(matchId: string, userId: string, cardInPlayId: string, newMode: 'normal' | 'defense' | 'evasion'): Promise<CardInPlay> {
    throw new Error('Use WebSocket "change_defensive_mode" handler instead. REST endpoints deprecated for game actions.');
  }
}
