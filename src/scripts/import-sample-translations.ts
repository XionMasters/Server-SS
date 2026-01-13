// src/scripts/import-sample-translations.ts
// Script para importar traducciones de ejemplo de las cartas existentes

import sequelize from '../config/database';
import Card from '../models/Card';
import CardTranslation from '../models/CardTranslation';

// Traducciones de ejemplo para algunas cartas icónicas
const sampleTranslations = [
  {
    cardName: 'Seiya de Pegaso',
    translations: {
      en: {
        name: 'Pegasus Seiya',
        description: 'The Bronze Saint of Pegasus. A brave warrior who never gives up.',
        abilities: {
          'Meteoros de Pegaso': {
            name: 'Pegasus Meteor Fist',
            description: 'Devastating attack with 100 meteors'
          },
          'Cometa de Pegaso': {
            name: 'Pegasus Comet Fist',
            description: 'Focused attack with all cosmos power'
          }
        }
      },
      pt: {
        name: 'Seiya de Pégaso',
        description: 'O Cavaleiro de Bronze de Pégaso. Um guerreiro corajoso que nunca desiste.',
        abilities: {
          'Meteoros de Pegaso': {
            name: 'Meteoros de Pégaso',
            description: 'Ataque devastador com 100 meteoros'
          },
          'Cometa de Pegaso': {
            name: 'Cometa de Pégaso',
            description: 'Ataque concentrado com todo o poder do cosmo'
          }
        }
      }
    }
  },
  {
    cardName: 'Shiryu de Dragón',
    translations: {
      en: {
        name: 'Dragon Shiryu',
        description: 'The Bronze Saint of Dragon. Master of defensive techniques.',
        abilities: {
          'Cólera del Dragón': {
            name: 'Rising Dragon',
            description: 'Concentrated attack with all cosmos'
          },
          'Escudo del Dragón': {
            name: 'Dragon Shield',
            description: 'Ultimate defensive technique'
          }
        }
      },
      pt: {
        name: 'Shiryu de Dragão',
        description: 'O Cavaleiro de Bronze do Dragão. Mestre das técnicas defensivas.',
        abilities: {
          'Cólera del Dragón': {
            name: 'Cólera do Dragão',
            description: 'Ataque concentrado com todo o cosmo'
          },
          'Escudo del Dragón': {
            name: 'Escudo do Dragão',
            description: 'Técnica defensiva definitiva'
          }
        }
      }
    }
  },
  {
    cardName: 'Hyoga de Cisne',
    translations: {
      en: {
        name: 'Cygnus Hyoga',
        description: 'The Bronze Saint of Cygnus. Ice warrior with freezing techniques.',
        abilities: {
          'Polvo de Diamante': {
            name: 'Diamond Dust',
            description: 'Freezes enemies with absolute zero temperature'
          },
          'Aurora Trueno': {
            name: 'Aurora Thunder Attack',
            description: 'Thunder attack with ice power'
          }
        }
      },
      pt: {
        name: 'Hyoga de Cisne',
        description: 'O Cavaleiro de Bronze do Cisne. Guerreiro do gelo com técnicas congelantes.',
        abilities: {
          'Polvo de Diamante': {
            name: 'Pó de Diamante',
            description: 'Congela inimigos com temperatura zero absoluto'
          },
          'Aurora Trueno': {
            name: 'Trovão da Aurora',
            description: 'Ataque trovão com poder do gelo'
          }
        }
      }
    }
  },
  {
    cardName: 'Shun de Andrómeda',
    translations: {
      en: {
        name: 'Andromeda Shun',
        description: 'The Bronze Saint of Andromeda. Uses chains as weapons with compassion.',
        abilities: {
          'Cadena Nebular': {
            name: 'Nebula Chain',
            description: 'Chains that capture and bind enemies'
          },
          'Tormenta Nebular': {
            name: 'Nebula Storm',
            description: 'Powerful whirlwind of chains'
          }
        }
      },
      pt: {
        name: 'Shun de Andrômeda',
        description: 'O Cavaleiro de Bronze de Andrômeda. Usa correntes como armas com compaixão.',
        abilities: {
          'Cadena Nebular': {
            name: 'Corrente de Andrômeda',
            description: 'Correntes que capturam e prendem inimigos'
          },
          'Tormenta Nebular': {
            name: 'Tempestade Nebular',
            description: 'Poderoso turbilhão de correntes'
          }
        }
      }
    }
  },
  {
    cardName: 'Ikki de Fénix',
    translations: {
      en: {
        name: 'Phoenix Ikki',
        description: 'The Bronze Saint of Phoenix. Immortal warrior who rises from ashes.',
        abilities: {
          'Ave Fénix': {
            name: 'Phoenix Wings Rise',
            description: 'Powerful attack with phoenix flames'
          },
          'Ilusión Fénix': {
            name: 'Phoenix Illusion',
            description: 'Creates powerful illusions'
          }
        }
      },
      pt: {
        name: 'Ikki de Fênix',
        description: 'O Cavaleiro de Bronze da Fênix. Guerreiro imortal que renasce das cinzas.',
        abilities: {
          'Ave Fénix': {
            name: 'Golpe da Fênix',
            description: 'Ataque poderoso com chamas da fênix'
          },
          'Ilusión Fénix': {
            name: 'Ilusão da Fênix',
            description: 'Cria ilusões poderosas'
          }
        }
      }
    }
  },
  {
    cardName: 'Mu de Aries',
    translations: {
      en: {
        name: 'Aries Mu',
        description: 'The Gold Saint of Aries. Master of psychokinesis and armor repair.',
        abilities: {
          'Extinción Estelar': {
            name: 'Starlight Extinction',
            description: 'Telekinetic attack that destroys everything'
          },
          'Muro de Cristal': {
            name: 'Crystal Wall',
            description: 'Impenetrable psychic barrier'
          }
        }
      },
      pt: {
        name: 'Mu de Áries',
        description: 'O Cavaleiro de Ouro de Áries. Mestre da psicocinese e reparo de armaduras.',
        abilities: {
          'Extinción Estelar': {
            name: 'Extinção Estelar',
            description: 'Ataque telecinético que destrói tudo'
          },
          'Muro de Cristal': {
            name: 'Muralha de Cristal',
            description: 'Barreira psíquica impenetrável'
          }
        }
      }
    }
  },
  {
    cardName: 'Saga de Géminis',
    translations: {
      en: {
        name: 'Gemini Saga',
        description: 'The Gold Saint of Gemini. Possesses dual personality and immense power.',
        abilities: {
          'Explosión de Galaxias': {
            name: 'Galaxian Explosion',
            description: 'Most powerful technique, shatters galaxies'
          },
          'Otra Dimensión': {
            name: 'Another Dimension',
            description: 'Sends enemies to another dimension'
          }
        }
      },
      pt: {
        name: 'Saga de Gêmeos',
        description: 'O Cavaleiro de Ouro de Gêmeos. Possui dupla personalidade e imenso poder.',
        abilities: {
          'Explosión de Galaxias': {
            name: 'Explosão de Galáxias',
            description: 'Técnica mais poderosa, estilhaça galáxias'
          },
          'Otra Dimensión': {
            name: 'Outra Dimensão',
            description: 'Envia inimigos para outra dimensão'
          }
        }
      }
    }
  }
];

async function importTranslations() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos');

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const cardData of sampleTranslations) {
      try {
        // Buscar la carta por nombre en español
        const card = await Card.findOne({
          where: { name: cardData.cardName }
        });

        if (!card) {
          console.log(`⚠️  Carta no encontrada: ${cardData.cardName}`);
          skipped++;
          continue;
        }

        // Importar traducción al inglés
        if (cardData.translations.en) {
          const [translation, created] = await CardTranslation.findOrCreate({
            where: {
              card_id: card.id,
              language: 'en'
            },
            defaults: {
              name: cardData.translations.en.name,
              description: cardData.translations.en.description,
              ability_translations: cardData.translations.en.abilities || {}
            }
          });

          if (created) {
            console.log(`✅ Traducción EN creada: ${cardData.cardName} -> ${cardData.translations.en.name}`);
            imported++;
          } else {
            console.log(`⏭️  Traducción EN ya existe: ${cardData.cardName}`);
            skipped++;
          }
        }

        // Importar traducción al portugués
        if (cardData.translations.pt) {
          const [translation, created] = await CardTranslation.findOrCreate({
            where: {
              card_id: card.id,
              language: 'pt'
            },
            defaults: {
              name: cardData.translations.pt.name,
              description: cardData.translations.pt.description,
              ability_translations: cardData.translations.pt.abilities || {}
            }
          });

          if (created) {
            console.log(`✅ Traducción PT creada: ${cardData.cardName} -> ${cardData.translations.pt.name}`);
            imported++;
          } else {
            console.log(`⏭️  Traducción PT ya existe: ${cardData.cardName}`);
            skipped++;
          }
        }

      } catch (error: any) {
        console.error(`❌ Error procesando ${cardData.cardName}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Resumen de importación:');
    console.log(`   ✅ Importadas: ${imported}`);
    console.log(`   ⏭️  Omitidas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);

  } catch (error: any) {
    console.error('❌ Error durante la importación:', error);
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  importTranslations();
}

export default importTranslations;
