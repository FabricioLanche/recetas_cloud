const mongoose = require('mongoose');

const medicoSchema = new mongoose.Schema({
  cmp: { type: String, required: true, unique: true },
  nombre: String,
  especialidad: String,
  colegiaturaValida: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Medico', medicoSchema);