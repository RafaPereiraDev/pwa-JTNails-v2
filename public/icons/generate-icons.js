/**
 * Gera ícones PNG simples para o PWA usando apenas módulos nativos do Node.
 * Execute uma vez: node public/icons/generate-icons.js
 * 
 * Requer: npm install sharp  (ou pule e use o SVG diretamente)
 */
const fs = require('fs');
const path = require('path');

// Ícone SVG inline — fundo rosa com emoji de unhas
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#e91e8c"/>
  <rect x="${size*0.15}" y="${size*0.15}" width="${size*0.7}" height="${size*0.7}" rx="${Math.round(size*0.08)}" fill="rgba(255,255,255,0.15)"/>
  <text x="${size/2}" y="${size*0.68}" font-size="${size*0.52}" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif" fill="white">💅</text>
</svg>`;

try {
  const sharp = require('sharp');
  Promise.all([
    sharp(Buffer.from(svg(192))).png().toFile(path.join(__dirname, 'icon-192.png')),
    sharp(Buffer.from(svg(512))).png().toFile(path.join(__dirname, 'icon-512.png')),
  ]).then(() => console.log('Ícones gerados: icon-192.png e icon-512.png'))
    .catch(e => console.error('Erro ao gerar ícones:', e.message));
} catch (e) {
  console.log('sharp não instalado — salvando SVG como fallback');
  fs.writeFileSync(path.join(__dirname, 'icon-192.png'), Buffer.from(svg(192)));
  fs.writeFileSync(path.join(__dirname, 'icon-512.png'), Buffer.from(svg(512)));
  console.log('SVGs salvos como .png (fallback). Instale sharp para PNGs reais.');
}
