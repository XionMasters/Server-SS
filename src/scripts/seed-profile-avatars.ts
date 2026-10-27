import dotenv from 'dotenv';
import sequelize from '../config/database';
import ProfileAvatar from '../infrastructure/database/models/ProfileAvatar';
import Card from '../infrastructure/database/models/Card';

dotenv.config();

async function seedProfileAvatars() {
  await sequelize.authenticate();
  console.log('🔌 Conectado a la base de datos\n');
  
  try {
    console.log('📸 Creando avatares de perfil por defecto...\n');
    
    // Avatares por defecto (siempre desbloqueados) - Carpeta dedicada
    const defaultAvatars = [
      {
        name: 'Avatar Seiya',
        image_url: '/assets/profile-avatars/seiya.webp',
        unlock_type: 'default',
        rarity: 'common'
      },
      {
        name: 'Avatar Shiryu',
        image_url: '/assets/profile-avatars/shiryu.webp',
        unlock_type: 'default',
        rarity: 'common'
      },
      {
        name: 'Avatar Hyoga',
        image_url: '/assets/profile-avatars/hyoga.webp',
        unlock_type: 'default',
        rarity: 'common'
      },
    ];
    
    for (const avatarData of defaultAvatars) {
      const existing = await ProfileAvatar.findOne({
        where: { name: avatarData.name }
      });
      
      if (!existing) {
        await ProfileAvatar.create({
          ...avatarData,
          is_active: true
        } as any);
        console.log(`✅ Avatar creado: ${avatarData.name}`);
      } else {
        console.log(`⏭️  Avatar ya existe: ${avatarData.name}`);
      }
    }
    
    console.log('\n🌟 Creando avatares desbloqueables por cartas legendarias...\n');
    
    // Obtener caballeros dorados (legendarios)
    const goldCards = await Card.findAll({
      where: {
        type: 'caballero',
        rarity: 'legendaria'
      },
      limit: 12  // Los 12 caballeros de oro
    });
    
    console.log(`📦 Encontradas ${goldCards.length} cartas legendarias\n`);
    
    for (const card of goldCards) {
      const avatarName = `Avatar ${card.name}`;
      
      const existing = await ProfileAvatar.findOne({
        where: { name: avatarName }
      });
      
      if (!existing) {
        await ProfileAvatar.create({
          name: avatarName,
          image_url: card.image_url || '/assets/profile-avatars/default-gold.webp',
          unlock_type: 'card_unlock',
          required_card_id: card.id,
          rarity: 'legendary',
          is_active: true
        });
        console.log(`✅ Avatar desbloqueable creado: ${avatarName} (requiere carta: ${card.name})`);
      } else {
        console.log(`⏭️  Avatar ya existe: ${avatarName}`);
      }
    }
    
    console.log('\n✅ Seed de avatares completado');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

seedProfileAvatars();
