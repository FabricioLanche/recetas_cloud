const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.log(`[DB] Cargando variables desde: ${envPath}`);

const {
  MONGO_HOST,
  MONGO_PORT,
  MONGO_DB_NAME,
  MONGO_USER,
  MONGO_PASS,
} = process.env;

let credentials = '';
if (MONGO_USER && MONGO_PASS) {
  credentials = `${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(MONGO_PASS)}@`;
}

let url = `mongodb://${credentials}${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}?authSource=${MONGO_USER}`;

console.log(`[DB] URL construida: ${url}`);

module.exports = {
  url,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
};
