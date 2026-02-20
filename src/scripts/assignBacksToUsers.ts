import { sequelize } from '../config/database';
import User from '../models/User';
import DeckBack from '../models/DeckBack';
import UserDeckBackUnlock from '../models/UserDeckBackUnlock';

async function assignBacksToUsers() {
  try {
    console.log('🎴 Asignando dorsos a usuarios existentes...\n');
    
    await sequelize.sync();
    
    const users = await User.findAll({ attributes: ['id', 'username'], raw: true });
    const backs = await DeckBack.findAll({ attributes: ['id', 'name', 'unlock_type'], raw: true });
    
    if (users.length === 0) {
      console.log('❌ No hay usuarios para asignar dorsos');
      return;
    }
    
    console.log(`👥 ${users.length} usuario(s) encontrado(s)`);
    console.log(`🎴 ${backs.length} dorso(s) disponible(s)\n`);
    
    let totalAssigned = 0;
    
    for (const user of users) {
      console.log(`\n👤 Asignando dorsos a: ${user.username}`);
      
      // Obtener dorsos ya asignados a este usuario
      const existingUnlocks = await UserDeckBackUnlock.findAll({
        where: { user_id: user.id },
        attributes: ['deck_back_id']
      });
      
      const existingBackIds = new Set(existingUnlocks.map(u => u.deck_back_id));
      
      // Asignar todos los dorsos que no tenga
      const backsToAssign = backs.filter(b => !existingBackIds.has(b.id));
      
      if (backsToAssign.length === 0) {
        console.log(`   ✅ Ya tiene todos los ${backs.length} dorsos`);
        continue;
      }
      
      for (const back of backsToAssign) {
        await UserDeckBackUnlock.create({
          user_id: user.id,
          deck_back_id: back.id,
          unlock_source: back.unlock_type === 'default' ? 'initial_setup' : 'seasonal'
        });
        
        console.log(`   ✅ ${back.name} (${back.unlock_type})`);
        totalAssigned++;
      }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   Total dorsos asignados: ${totalAssigned}`);
    console.log(`   ✅ Operación completada!\n`);
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

assignBacksToUsers();
