// package.json - Agregar dependencias para generación de imágenes
{
  "name": "card-image-generator",
  "scripts": {
    "generate-cards": "ts-node src/utils/cardImageGenerator.ts",
    "setup-fonts": "node scripts/downloadFonts.js"
  },
  "devDependencies": {
    "canvas": "^2.11.2",
    "@types/node": "^20.0.0",
    "sharp": "^0.32.0"
  }
}

// Para instalar:
// npm install canvas sharp @types/node