const express = require('express');
const router = express.Router();
const multer = require('multer');
const recetasService = require('../services/recetasService');
const {listarMedicos} = require("../services/recetasService");

const almacenamiento = multer.memoryStorage();
const cargador = multer({
    storage: almacenamiento,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'), false);
        }
    }
});

const manejarCarga = (req, res, next) => {
    cargador.single('archivoPDF')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

// Listado con filtros y paginación
router.get('/filter', recetasService.listarRecetas);

// Subir PDF
router.post('/upload', (req, res, next) => {
    console.log('Request recibida en /recetas/upload');
    next();
}, manejarCarga, recetasService.subirReceta);

// Colapsa validación y actualización de estado en PUT
router.put('/estado/:id', recetasService.actualizarEstadoReceta);

// Eliminar archivo PDF de una receta
router.delete('/archivo/:id', recetasService.eliminarArchivoReceta);

// Detalle por ID (devuelve receta + url PDF prefirmada si existe)
router.get('/:id', recetasService.obtenerRecetaPorId);

module.exports = router;