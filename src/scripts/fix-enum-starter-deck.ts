// Script para agregar STARTER_DECK al enum de user_card_transactions
import { sequelize } from '../config/database';

async function fixEnum() {
  try {
    console.log('🔧 Actualizando enum_user_card_transactions_reason...');
    
    // Agregar el valor STARTER_DECK al enum si no existe
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'STARTER_DECK' 
          AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'enum_user_card_transactions_reason'
          )
        ) THEN
          ALTER TYPE enum_user_card_transactions_reason ADD VALUE 'STARTER_DECK';
          RAISE NOTICE 'Valor STARTER_DECK agregado al enum';
        ELSE
          RAISE NOTICE 'Valor STARTER_DECK ya existe en el enum';
        END IF;
      END
      $$;
    `);
    
    console.log('✅ Enum actualizado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando enum:', error);
    process.exit(1);
  }
}

fixEnum();
