/**
 * Sobres de la tienda. `npm run generate:packs` los crea o actualiza por `code` y retira los
 * que no estén aquí (devolviendo las monedas de los que los jugadores tengan sin abrir).
 *
 * `collections`: valores de cards.collection_id cuyas cartas pueden salir en el sobre
 * (santuario, poseidon, omega, black_saints: la carpeta de database/ de cada carta).
 * `coming_soon`: se muestra en la tienda bloqueado con "Próximamente" y no se puede comprar.
 */

export interface PackDefinition {
  code: string;
  name: string;
  description: string;
  price: number;
  collections: string[];
  coming_soon?: boolean;
  image_url?: string | null;
  /** Sobres seguidos sin épica o superior tras los que se garantiza una (por defecto 10). */
  pity_threshold?: number;
}

export const PACK_DEFINITIONS: PackDefinition[] = [
  {
    code: 'santuario',
    name: 'Sobre del Santuario',
    description: '5 cartas de la saga del Santuario. Cada 10 sobres sin épica, el siguiente trae una asegurada.',
    price: 100,
    collections: ['santuario'],
  },
  {
    code: 'santuario_black_saints',
    name: 'Sobre del Santuario y los Caballeros Negros',
    description: '5 cartas del Santuario y de los Caballeros Negros. Cada 10 sobres sin épica, el siguiente trae una asegurada.',
    price: 150,
    collections: ['santuario', 'black_saints'],
  },
  {
    code: 'poseidon',
    name: 'Sobre de Poseidón',
    description: '5 cartas de la saga de Poseidón. Cada 10 sobres sin épica, el siguiente trae una asegurada.',
    price: 150,
    collections: ['poseidon'],
  },
  {
    code: 'omega',
    name: 'Sobre de Omega',
    description: '5 cartas de la saga Omega. Próximamente.',
    price: 150,
    collections: ['omega'],
    coming_soon: true,
  },
];
