// generateDefaultAvatars.ts
// Script para generar y registrar avatares por defecto usando Pollinations
import fs from 'fs';
import path from 'path';
import https from 'https';
import { sequelize } from '../config/database';
import ProfileAvatar from '../models/ProfileAvatar';
import User from '../models/User';
import UserProfile from '../models/UserProfile';
import UserAvatarUnlock from '../models/UserAvatarUnlock';

const AVATAR_DIR = path.resolve(__dirname, '../assets/avatars');

// Prompts para Pollinations (intentando estilo Saint Seiya)
const PROMPTS: { name: string; prompt: string }[] = [
  { name: 'Bronce Cósmico', prompt: 'Saint Seiya bronze knight portrait, cosmic armor, dramatic lighting, anime style' },
  { name: 'Plata Estelar', prompt: 'Saint Seiya silver knight portrait, shimmering silver armor, stars background, anime style' },
  { name: 'Oro Galáctico', prompt: 'Saint Seiya gold saint portrait, radiant golden armor, galaxy background, anime style' },
  { name: 'Sombras Sagradas', prompt: 'Saint Seiya dark knight portrait, shadow armor, mystical aura, anime style' },
  { name: 'Cosmos Divino', prompt: 'Saint Seiya divine saint portrait, ethereal luminous armor, nebula background, anime style' }
];

function downloadImage(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        https.get(res.headers.location, r2 => {
          r2.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        }).on('error', reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

async function ensureDirectory() {
  if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  }
}

async function generateAvatars() {
  await ensureDirectory();

  const createdAvatarIds: string[] = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const { name, prompt } = PROMPTS[i];
    const fileName = `avatar_${i + 1}.png`;
    const filePath = path.join(AVATAR_DIR, fileName);

    // Si ya existe archivo, saltar descarga
    if (!fs.existsSync(filePath)) {
      const encodedPrompt = encodeURIComponent(prompt);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
      console.log(`Descargando avatar '${name}' desde Pollinations...`);
      try {
        await downloadImage(pollinationsUrl, filePath);
      } catch (err) {
        console.error(`Error descargando '${name}':`, err);
        continue;
      }
    } else {
      console.log(`Archivo existente para '${name}', se reutiliza.`);
    }

    // Crear registro en DB si no existe uno con mismo nombre
    let avatar = await ProfileAvatar.findOne({ where: { name } });
    if (!avatar) {
      avatar = await ProfileAvatar.create({
        name,
        image_url: `avatars/${fileName}`,
        unlock_type: 'default',
        rarity: 'common',
        is_active: true
      });
      console.log(`Avatar '${name}' creado (ID: ${avatar.id}).`);
    } else {
      console.log(`Avatar '${name}' ya existe (ID: ${avatar.id}).`);
    }

    createdAvatarIds.push(avatar.id);
  }

  // Asociar avatares a todos los usuarios existentes
  const users = await User.findAll();
  console.log(`Asociando ${createdAvatarIds.length} avatares a ${users.length} usuarios...`);

  for (const user of users) {
    // Asegurar UserProfile
    let userProfile = await UserProfile.findOne({ where: { user_id: (user as any).id } });
    if (!userProfile) {
      userProfile = await UserProfile.create({
        user_id: (user as any).id,
        avatar_image_id: createdAvatarIds[0]
      });
      console.log(`UserProfile creado para usuario ${user.username}`);
    }

    // Desbloquear todos los avatares default
    for (const avatarId of createdAvatarIds) {
      const existingUnlock = await UserAvatarUnlock.findOne({
        where: { user_id: (user as any).id, avatar_id: avatarId }
      });
      if (!existingUnlock) {
        await UserAvatarUnlock.create({
          user_id: (user as any).id,
          avatar_id: avatarId,
          unlock_source: 'default_seed'
        });
      }
    }
  }

  console.log('Proceso completado.');
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a DB OK');
    await generateAvatars();
  } catch (err) {
    console.error('Error en generación de avatares:', err);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
})();
