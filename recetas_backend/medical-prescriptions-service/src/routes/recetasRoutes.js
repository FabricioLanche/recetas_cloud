const express = require('express');
const router = express.Router();
const multer = require('multer');
const almacenamiento = multer.memoryStorage();

// Configuración mejorada de multer
const cargador = multer({
  storage: almacenamiento,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite de 5MB
  },
  fileFilter: (req, file, cb) => {
    // Aceptar solo archivos PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  }
});

const RecetasController = require('../controllers/recetasController');
const controlador = new RecetasController();

// Manejo de errores para la carga de archivos
const manejarCarga = (req, res, next) => {
  cargador.single('archivoPDF')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Error de multer (tamaño de archivo, etc.)
      return res.status(400).json({ error: err.message });
    } else if (err) {
      // Otro tipo de error (filtro de archivo, etc.)
      return res.status(400).json({ error: err.message });
    }
    // Si no hay errores, continuar
    next();
  });
};

// Listado con filtros y paginación
router.get('/', (req, res) => controlador.listarRecetas(req, res));

router.post(
  '/upload',
  manejarCarga,
  (req, res) => controlador.subirReceta(req, res)
);

router.post('/validacion/:id', (req, res) => controlador.validarReceta(req, res));
router.patch('/estado/:id', (req, res) => controlador.actualizarEstadoReceta(req, res));
router.get('/archivo/:id', (req, res) => controlador.obtenerArchivoReceta(req, res));
router.delete('/archivo/:id', (req, res) => controlador.eliminarArchivoReceta(req, res));

// Detalle por ID (poner al final para no interceptar rutas específicas como /archivo/:id)
router.get('/:id', (req, res) => controlador.obtenerRecetaPorId(req, res));

module.exports = router;
