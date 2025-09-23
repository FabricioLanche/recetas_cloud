const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Cargar .env desde la raíz del servicio (dos niveles arriba de src/config)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.log(`[DB] Cargando variables desde: ${envPath}`);

// Soportar ambas variables: MONGODB_URI (común) y MONGO_URI. Usar localhost por defecto.
let url = process.env.MONGODB_URI || process.env.MONGO_URI;
console.log(`[DB] Fuente de URL: ${process.env.MONGODB_URI ? 'MONGODB_URI' : (process.env.MONGO_URI ? 'MONGO_URI' : 'DEFAULT')}`);

if (!url) {
  console.warn('[DB] No se encontró MONGODB_URI ni MONGO_URI. Usando valor por defecto: mongodb://127.0.0.1:27017/recetasdb');
}

module.exports = {
  url,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
};