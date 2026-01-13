// src/models/associations.ts
import User from './User';
import Card from './Card';
import UserCard from './UserCard';
import CardKnight from './CardKnight';
import CardAbility from './CardAbility';
import CardTranslation from './CardTranslation';
import Pack from './Pack';
import UserPack from './UserPack';
import UserTransaction from './UserTransaction';
import UserCardTransaction from './UserCardTransaction';
import Deck from './Deck';
import DeckCard from './DeckCard';
import Match from './Match';
import CardInPlay from './CardInPlay';
import MatchAction from './MatchAction';

// Configurar relaciones entre User y Card
User.belongsToMany(Card, {
  through: UserCard,
  foreignKey: 'user_id',
  otherKey: 'card_id',
  as: 'cards'
});

Card.belongsToMany(User, {
  through: UserCard,
  foreignKey: 'card_id',
  otherKey: 'user_id',
  as: 'users'
});

// Configurar relaciones de UserCard
UserCard.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserCard.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Configurar relaciones de Card con sus detalles
Card.hasOne(CardKnight, { foreignKey: 'card_id', as: 'card_knight' });
Card.hasMany(CardAbility, { foreignKey: 'card_id', as: 'card_abilities' });
Card.hasMany(CardTranslation, { foreignKey: 'card_id', as: 'translations' });

CardKnight.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });
CardAbility.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });
CardTranslation.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Configurar relaciones de Packs
User.hasMany(UserPack, { foreignKey: 'user_id', as: 'user_packs' });
Pack.hasMany(UserPack, { foreignKey: 'pack_id', as: 'user_packs' });

UserPack.belongsTo(User, { foreignKey: 'user_id', as: 'User' });
UserPack.belongsTo(Pack, { foreignKey: 'pack_id', as: 'Pack' });

// Configurar relaciones de Transacciones
User.hasMany(UserTransaction, { foreignKey: 'user_id', as: 'transactions' });
User.hasMany(UserCardTransaction, { foreignKey: 'user_id', as: 'card_transactions' });

UserTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserCardTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserCardTransaction.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Configurar relaciones de Decks
User.hasMany(Deck, { foreignKey: 'user_id', as: 'decks' });
Deck.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Deck.belongsToMany(Card, {
  through: DeckCard,
  foreignKey: 'deck_id',
  otherKey: 'card_id',
  as: 'cards'
});

Card.belongsToMany(Deck, {
  through: DeckCard,
  foreignKey: 'card_id',
  otherKey: 'deck_id',
  as: 'decks'
});

DeckCard.belongsTo(Deck, { foreignKey: 'deck_id', as: 'deck' });
DeckCard.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Configurar relaciones de Matches
Match.belongsTo(User, { foreignKey: 'player1_id', as: 'player1' });
Match.belongsTo(User, { foreignKey: 'player2_id', as: 'player2' });
Match.belongsTo(User, { foreignKey: 'winner_id', as: 'winner' });
Match.belongsTo(Deck, { foreignKey: 'player1_deck_id', as: 'player1_deck' });
Match.belongsTo(Deck, { foreignKey: 'player2_deck_id', as: 'player2_deck' });

User.hasMany(Match, { foreignKey: 'player1_id', as: 'matches_as_player1' });
User.hasMany(Match, { foreignKey: 'player2_id', as: 'matches_as_player2' });

// Configurar relaciones de CardInPlay
Match.hasMany(CardInPlay, { foreignKey: 'match_id', as: 'cards_in_play' });
CardInPlay.belongsTo(Match, { foreignKey: 'match_id', as: 'match' });
CardInPlay.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Configurar relaciones de MatchAction
Match.hasMany(MatchAction, { foreignKey: 'match_id', as: 'actions' });
MatchAction.belongsTo(Match, { foreignKey: 'match_id', as: 'match' });
MatchAction.belongsTo(User, { foreignKey: 'player_id', as: 'player' });

export { 
  User, 
  Card, 
  UserCard, 
  CardKnight, 
  CardAbility,
  CardTranslation, 
  Pack, 
  UserPack, 
  UserTransaction, 
  UserCardTransaction,
  Deck,
  DeckCard,
  Match,
  CardInPlay,
  MatchAction
};