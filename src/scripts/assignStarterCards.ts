// src/scripts/assignStarterCards.ts
import { sequelize } from '../config/database';
import Card from '../models/Card';
import UserCard from '../models/UserCard';
import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import transactionService from '../services/transactionService';
import { 
  STARTER_DECK_CARDS, 
  STARTER_DECK_NAME, 
  STARTER_DECK_DESCRIPTION,
  validateStarterDeck 
} from '../config/starter-deck.config';

/**
 * Asigna el deck inicial de 40 cartas a un nuevo usuario
 * y crea el deck pre-configurado listo para jugar
 */
export const assignStarterCards = async (userId: string): Promise<void> => {
  try {
    console.log(`🎁 Asignando deck inicial para usuario: ${userId}`);

    // Validar configuración del deck
    const validation = validateStarterDeck();
    if (!validation.valid) {
      throw new Error(`Configuración de deck inicial inválida: ${validation.message}`);
    }

    // Obtener las cartas del deck inicial desde la base de datos
    const cardIds = STARTER_DECK_CARDS.map(dc => dc.card_id);
    const cards = await Card.findAll({
      where: {
        id: cardIds
      }
    });

    if (cards.length === 0) {
      throw new Error('No se encontraron cartas para el deck inicial. Configura starter-deck.config.ts con IDs válidos.');
    }

    // Mapa de cartas por ID para fácil acceso
    const cardMap = new Map(cards.map(card => [card.id, card]));

    // Asignar cartas al usuario (UserCard)
    let totalCardsAssigned = 0;
    for (const deckCard of STARTER_DECK_CARDS) {
      const card = cardMap.get(deckCard.card_id);
      
      if (!card) {
        console.warn(`⚠️  Carta ${deckCard.card_id} no encontrada en la base de datos. Saltando...`);
        continue;
      }

      // Crear o actualizar UserCard con la cantidad especificada
      const [userCard, created] = await UserCard.findOrCreate({
        where: {
          user_id: userId,
          card_id: card.id
        },
        defaults: {
          user_id: userId,
          card_id: card.id,
          quantity: deckCard.quantity,
          is_foil: false,
          acquired_at: new Date()
        }
      });

      // Si ya existía, sumar la cantidad
      if (!created) {
        userCard.quantity += deckCard.quantity;
        await userCard.save();
      }

      totalCardsAssigned += deckCard.quantity;

      // Log de la transacción de carta
      await transactionService.logCardTransaction(
        userId,
        card.id,
        deckCard.quantity,
        'ACQUIRE',
        'STARTER_DECK',
        'Cartas del deck inicial asignadas al registrarse',
        false,
        undefined,
        undefined,
        {
          card_name: card.name,
          card_rarity: card.rarity,
          card_type: card.type,
          source: 'starter_deck',
          quantity: deckCard.quantity
        }
      );
    }

    console.log(`✅ ${totalCardsAssigned} cartas asignadas al usuario ${userId}`);

    // Crear el deck inicial pre-configurado
    const deck = await Deck.create({
      user_id: userId,
      name: STARTER_DECK_NAME,
      description: STARTER_DECK_DESCRIPTION,
      is_active: true // Marcar como deck activo por defecto
    });

    console.log(`📦 Deck inicial creado: ${deck.id}`);

    // Agregar las cartas al deck (DeckCard)
    const deckCardEntries = STARTER_DECK_CARDS
      .filter(dc => cardMap.has(dc.card_id))
      .map(dc => ({
        deck_id: deck.id,
        card_id: dc.card_id,
        quantity: dc.quantity
      }));

    await DeckCard.bulkCreate(deckCardEntries);

    console.log(`🎴 ${deckCardEntries.length} tipos de cartas agregadas al deck`);
    console.log(`🎉 Deck inicial completo para usuario ${userId}!`);

  } catch (error) {
    console.error('❌ Error asignando deck inicial:', error);
    throw error;
  }
};

// Script para ejecutar manualmente
const manualAssign = async () => {
  try {
    const userId = process.argv[2]; // Pasar user ID como argumento
    if (!userId) {
      console.log('❌ Uso: npx ts-node src/scripts/assignStarterCards.ts <user_id>');
      process.exit(1);
    }

    await assignStarterCards(userId);
    console.log('🎉 Cartas iniciales asignadas exitosamente!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  manualAssign();
}

export default assignStarterCards;