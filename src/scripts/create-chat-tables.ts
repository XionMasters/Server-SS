// src/scripts/create-chat-tables.ts
import sequelize from '../config/database';
import ChatMessage from '../models/ChatMessage';

async function createChatTables() {
  try {
    console.log('🔧 Iniciando creación de tablas de chat...');

    // Sincronizar ChatMessage
    await ChatMessage.sync({ alter: true });
    console.log('✅ Tabla chat_messages creada/actualizada');

    // Verificar que los índices se crearon correctamente
    const [indexes] = await sequelize.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'chat_messages';
    `);
    
    console.log('\n📊 Índices en chat_messages:');
    console.table(indexes);

    console.log('\n✅ Migración completada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

createChatTables();
