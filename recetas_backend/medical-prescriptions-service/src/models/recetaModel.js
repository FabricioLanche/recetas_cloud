const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  codigoProducto: String,
  nombre: String,
  cantidad: Number
});

const recetaSchema = new mongoose.Schema({
  pacienteDNI: { type: String, required: true },
  medicoCMP: { type: String, required: true },
  fechaEmision: { type: Date, required: true },
  productos: [productoSchema],
  archivoPDF: { type: String, required: true },
  estadoValidacion: { type: String, enum: ['pendiente', 'validada', 'rechazada'], default: 'pendiente' }
}, { timestamps: true });

// Índices para acelerar búsquedas y ordenación
recetaSchema.index({ pacienteDNI: 1 });
recetaSchema.index({ medicoCMP: 1 });
recetaSchema.index({ createdAt: -1 });

// Exportar como 'Receta' usando la colección en español 'recetas'
module.exports = mongoose.model('Receta', recetaSchema, 'recetas');