// src/config/starter-deck.config.ts
/**
 * Configuración del Deck Inicial para nuevos usuarios
 * 
 * Para modificar las cartas del deck inicial:
 * 1. Encuentra el ID de la carta en la base de datos (tabla cards)
 * 2. Agrega o modifica las entradas en STARTER_DECK_CARDS
 * 3. Asegúrate de que el total de cartas sume 40
 * 4. Usa solo cartas de rareza 'comun' y 'rara' para mantener balance
 * 
 * Formato:
 * { card_id: 'uuid-de-la-carta', quantity: cantidad (1-3) }
 */

export interface StarterDeckCard {
  card_id: string;
  quantity: number;
}

/**
 * 🎴 DECK INICIAL - 40 CARTAS COMPETITIVAS
 * 
 * INSTRUCCIONES PARA CONFIGURAR:
 * 
 * 1. Para ver las cartas disponibles en tu base de datos:
 *    - Cartas comunes: SELECT id, name, card_type, rarity FROM cards WHERE rarity = 'comun';
 *    - Cartas raras: SELECT id, name, card_type, rarity FROM cards WHERE rarity = 'rara';
 * 
 * 2. Reemplaza los card_id con los IDs reales de tu base de datos
 * 
 * 3. Distribución recomendada para un deck balanceado:
 *    - 18-22 Caballeros (knights)
 *    - 8-12 Técnicas (techniques)
 *    - 4-6 Objetos (objects)
 *    - 2-4 Ayudantes (helpers)
 *    - 2-4 Ocasiones (occasions)
 * 
 * 4. Cantidad por carta:
 *    - quantity: 1 → Una copia de la carta
 *    - quantity: 2 → Dos copias de la carta
 *    - quantity: 3 → Tres copias de la carta (máximo recomendado)
 * 
 * 5. Ejemplo de deck competitivo:
 *    - Core de caballeros comunes (3 copias cada uno = consistencia)
 *    - Técnicas raras de remoción/buff (2 copias)
 *    - Objetos de utilidad (2-3 copias)
 *    - Ayudantes para draw/search (1-2 copias)
 */

export const STARTER_DECK_CARDS: StarterDeckCard[] = [
  // CABALLEROS COMUNES (12 cartas)
  { card_id: '0f8b3ef0-eaa6-44af-b96d-f3db923ca9d6', quantity: 3 }, // Ban de León Menor
  { card_id: '518c61f2-a935-4654-bc88-26559e9351c5', quantity: 3 }, // Geki de Oso
  { card_id: 'e39da5ff-7444-45e0-8a32-75d368fb70dd', quantity: 3 }, // Ichi de Hidra
  { card_id: 'db12562a-9fcf-43a5-8690-fe3610028ab5', quantity: 3 }, // Jabu de Unicornio
  
  // CABALLEROS RAROS (8 cartas)
  { card_id: '64f8f65e-7a2d-4236-9aa3-fc137737848e', quantity: 2 }, // Seiya de Pegaso
  { card_id: '60b30866-ed24-42bc-b9c7-ab16b7337baa', quantity: 2 }, // Shiryu de Dragón
  { card_id: '53fda6ba-2917-43a8-952b-9322f4efcdf4', quantity: 2 }, // Hyoga de Cisne
  { card_id: '5483c69c-568e-4879-a213-46938ea00207', quantity: 2 }, // Shun de Andrómeda
  
  // TÉCNICAS RARAS (10 cartas)
  { card_id: '23b0a8a2-64a1-4bf0-8aca-2439754774aa', quantity: 2 }, // Polvo de Diamantes
  { card_id: '814df114-cfba-4695-9318-09ad7563750b', quantity: 2 }, // Rozan Shoryu Ha
  { card_id: '82a7919d-0332-474e-a7a1-0725f9d13345', quantity: 2 }, // Cadena Nebular
  { card_id: 'cb8cee31-0012-4b98-a145-8a2d7ca25dca', quantity: 2 }, // Telequinesis
  { card_id: '86a48311-b7ad-4e50-a6f5-ed985116e817', quantity: 2 }, // Curación Divina
  
  // OBJETOS (6 cartas)
  { card_id: '072017d4-947b-499f-af7f-4035dfc14fd8', quantity: 2 }, // Cristal de Cosmos
  { card_id: 'b44aa169-a31a-466e-925d-4feb6412b61c', quantity: 2 }, // Pesas de Mu
  { card_id: 'd5a69c7b-2379-460b-a9ae-6fed4992733c', quantity: 2 }, // Manual de Combate
  
  // AYUDANTES (2 cartas)
  { card_id: '1af49623-a9c4-42a7-82df-1b2f1435fedd', quantity: 2 }, // Andreas Rize
  
  // OCASIONES (2 cartas)
  { card_id: '68f9eef7-e1dc-47d8-8c76-8c75661d15a7', quantity: 2 }, // Believe
];

/**
 * Validación del deck inicial
 */
export const validateStarterDeck = (): { valid: boolean; total: number; message?: string } => {
  const total = STARTER_DECK_CARDS.reduce((sum, card) => sum + card.quantity, 0);
  
  if (total !== 40) {
    return {
      valid: false,
      total,
      message: `El deck inicial debe tener 40 cartas. Actualmente tiene ${total} cartas.`
    };
  }

  // Validar que ninguna carta tenga más de 3 copias
  const invalidCards = STARTER_DECK_CARDS.filter(card => card.quantity > 3 || card.quantity < 1);
  if (invalidCards.length > 0) {
    return {
      valid: false,
      total,
      message: 'Todas las cartas deben tener entre 1 y 3 copias.'
    };
  }

  return { valid: true, total };
};

/**
 * Nombre del deck inicial
 */
export const STARTER_DECK_NAME = 'Deck Inicial - Caballeros de Athena';

/**
 * Descripción del deck inicial
 */
export const STARTER_DECK_DESCRIPTION = 'Deck balanceado de inicio con caballeros de bronce y técnicas básicas para comenzar tu aventura.';
