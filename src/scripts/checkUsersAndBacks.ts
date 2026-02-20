import { sequelize } from '../config/database';
import User from '../models/User';
import DeckBack from '../models/DeckBack';

async function check() {
  try {
    await sequelize.sync();
    
    const users = await User.findAll({ 
      attributes: ['id', 'username', 'email'],
      raw: true 
    });
    
    console.log('📋 Usuarios existentes:');
    if (users.length === 0) {
      console.log('   ❌ No hay usuarios');
    } else {
      users.forEach(u => console.log(`   ✅ ${u.username} (${u.email})`));
    }
    
    console.log('\n🎴 Dorsos disponibles:');
    const backs = await DeckBack.findAll({ 
      attributes: ['id', 'name', 'rarity', 'unlock_type'],
      raw: true 
    });
    console.log(`   Total: ${backs.length}`);
    backs.forEach(b => console.log(`   • ${b.name} (${b.rarity} - ${b.unlock_type})`));
    
    console.log('\n⚠️  Para que los usuarios tengan acceso a todos los dorsos,');
    console.log('   se recomienda crear nuevos usuarios que se creen con');
    console.log('   el dorso DEFAULT asignado automáticamente en el registro.');
    
    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();
