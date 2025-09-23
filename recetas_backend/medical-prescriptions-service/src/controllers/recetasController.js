const Receta = require('../models/recetaModel');
const servicioIntegracion = require('../services/integracionService');
const Medico = require('../models/medicos');

class RecetasController {

    // Listado con filtros y paginación
    async listarRecetas(req, res) {
        try {
            const {
                dni,
                cmp,
                estado,
                fechaDesde,
                fechaHasta,
                page = '1',
                limit = '10',
                sort = '-createdAt'
            } = req.query;

            const filtro = {};
            if (dni) filtro.pacienteDNI = String(dni);
            if (cmp) filtro.medicoCMP = String(cmp);
            if (estado) filtro.estadoValidacion = String(estado);

            if (fechaDesde || fechaHasta) {
                filtro.fechaEmision = {};
                if (fechaDesde) filtro.fechaEmision.$gte = new Date(fechaDesde);
                if (fechaHasta) filtro.fechaEmision.$lte = new Date(fechaHasta);
            }

            const pagina = Math.max(parseInt(page, 10) || 1, 1);
            const tamano = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

            // sort puede ser formato: 'campo' o '-campo'
            const sortObj = {};
            const camposSort = String(sort).split(',');
            for (const campo of camposSort) {
                const c = campo.trim();
                if (!c) continue;
                if (c.startsWith('-')) sortObj[c.substring(1)] = -1; else sortObj[c] = 1;
            }

            const [items, total] = await Promise.all([
                Receta.find(filtro)
                    .sort(sortObj)
                    .skip((pagina - 1) * tamano)
                    .limit(tamano),
                Receta.countDocuments(filtro)
            ]);

            res.json({
                page: pagina,
                limit: tamano,
                total,
                items
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al listar recetas', detalle: error.message });
        }
    }

    // Detalle por ID
    async obtenerRecetaPorId(req, res) {
        try {
            const { id } = req.params;
            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }
            const receta = await Receta.findById(id);
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });
            res.json(receta);
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener la receta', detalle: error.message });
        }
    }

    async subirReceta(req, res) {
        try {
            // Normalizar y validar campos de entrada
            let { pacienteDNI, medicoCMP, fechaEmision, productos } = req.body;

            // Multer pone el archivo en req.file
            if (!req.file) {
                return res.status(400).json({ error: 'Falta archivo PDF (campo archivoPDF)' });
            }

            // Convertir a string por si llegan como número
            if (pacienteDNI !== undefined && pacienteDNI !== null) pacienteDNI = String(pacienteDNI).trim();
            if (medicoCMP !== undefined && medicoCMP !== null) medicoCMP = String(medicoCMP).trim();
            if (fechaEmision !== undefined && fechaEmision !== null) fechaEmision = String(fechaEmision).trim();

            // Parsear productos si llega como string (multipart/form-data)
            if (typeof productos === 'string') {
                try {
                    productos = JSON.parse(productos);
                } catch (e) {
                    return res.status(400).json({ error: 'El campo productos debe ser un JSON válido' });
                }
            }

            // Validaciones básicas
            if (!pacienteDNI || typeof pacienteDNI !== 'string' || pacienteDNI.length !== 8) {
                return res.status(400).json({ error: 'pacienteDNI inválido (debe ser string de 8 dígitos)' });
            }
            if (!medicoCMP || typeof medicoCMP !== 'string') {
                return res.status(400).json({ error: 'medicoCMP inválido' });
            }
            if (!fechaEmision || isNaN(Date.parse(fechaEmision))) {
                return res.status(400).json({ error: 'fechaEmision inválida (ISO 8601 o fecha parseable)' });
            }
            if (!Array.isArray(productos) || productos.length === 0) {
                return res.status(400).json({ error: 'productos debe ser un arreglo no vacío' });
            }

            // Reglas de validez de receta (Perú): no futura y dentro de X días (default 30)
            const emision = new Date(fechaEmision);
            const ahora = new Date();
            if (emision > ahora) {
                return res.status(400).json({ error: 'La fecha de emisión no puede ser futura' });
            }
            const msPorDia = 24 * 60 * 60 * 1000;
            const diasTranscurridos = Math.floor((ahora - emision) / msPorDia);
            const VALIDEZ_DIAS = Number(process.env.RECETA_VALIDEZ_DIAS || 30);
            if (diasTranscurridos > VALIDEZ_DIAS) {
                return res.status(400).json({ error: `La receta ha expirado (validez ${VALIDEZ_DIAS} días)` });
            }

            // Validar productos
            for (const prod of productos) {
                if (
                    !prod.codigoProducto || typeof prod.codigoProducto !== 'string' ||
                    !prod.nombre || typeof prod.nombre !== 'string' ||
                    (typeof prod.cantidad !== 'number' && typeof prod.cantidad !== 'string') || Number(prod.cantidad) <= 0
                ) {
                    return res.status(400).json({ error: 'Producto inválido en la receta' });
                }
            }

            // Validar CMP contra la colección de médicos
            const medico = await Medico.findOne({ cmp: medicoCMP, colegiaturaValida: true });
            if (!medico) {
                return res.status(400).json({ error: 'CMP no registrado o colegiatura no válida' });
            }

            // Subir PDF a S3
            const archivoPDF = await servicioIntegracion.subirPDFaS3(req.file);

            // Crear receta en MongoDB
            const nuevaReceta = new Receta({
                pacienteDNI,
                medicoCMP,
                fechaEmision,
                // Asegurar cantidades como número
                productos: productos.map(p => ({
                    codigoProducto: p.codigoProducto,
                    nombre: p.nombre,
                    cantidad: Number(p.cantidad)
                })),
                archivoPDF,
                // Al validar CMP con éxito, marcamos como validada
                estadoValidacion: 'validada'
            });

            await nuevaReceta.save();
            res.status(201).json({ mensaje: 'Receta subida correctamente', receta: nuevaReceta });
        } catch (error) {
            res.status(500).json({ error: 'Error al subir la receta', detalle: error.message });
        }
    }

    async actualizarEstadoReceta(req, res) {
        try {
            const recetaId = req.params.id;
            const { estadoValidacion } = req.body;

            if (!recetaId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }
            if (!['pendiente', 'validada', 'rechazada'].includes(estadoValidacion)) {
                return res.status(400).json({ error: 'Estado de validación inválido' });
            }

            const receta = await Receta.findByIdAndUpdate(
                recetaId,
                { estadoValidacion },
                { new: true }
            );
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });

            res.json({ mensaje: 'Estado actualizado', receta });
        } catch (error) {
            res.status(500).json({ error: 'Error al actualizar el estado', detalle: error.message });
        }
    }

    // Obtener URL del archivo PDF de una receta (devuelve presigned URL si el bucket es privado)
    async obtenerArchivoReceta(req, res) {
        try {
            const recetaId = req.params.id;
            if (!recetaId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }

            const receta = await Receta.findById(recetaId);
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });
            if (!receta.archivoPDF) return res.status(404).json({ error: 'La receta no tiene archivo asociado' });

            // Si se solicita explícitamente URL directa (no recomendado si el bucket es privado)
            if (req.query.direct === 'true') {
                return res.json({ url: receta.archivoPDF, direct: true });
            }

            // Generar URL prefirmada con expiración (por defecto 300s)
            const expires = req.query.expires ? Number(req.query.expires) : 300;
            const signedUrl = await servicioIntegracion.generarUrlPresignadaDescarga(receta.archivoPDF, expires);
            return res.json({ url: signedUrl, expires });
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener el archivo', detalle: error.message });
        }
    }
        // Eliminar archivo PDF de una receta
    async eliminarArchivoReceta(req, res) {
        try {
            const recetaId = req.params.id;
            if (!recetaId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }

            const receta = await Receta.findById(recetaId);
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });

            if (!receta.archivoPDF) {
                return res.status(400).json({ error: 'No hay archivo para eliminar' });
            }

            // Eliminar archivo de S3
            await servicioIntegracion.eliminarArchivoDeS3(receta.archivoPDF);

            // Quitar referencia en MongoDB evitando validación del campo requerido
            const recetaActualizada = await Receta.findByIdAndUpdate(
                recetaId,
                { $unset: { archivoPDF: "" } },
                { new: true, runValidators: false }
            );

            res.json({ mensaje: 'Archivo eliminado correctamente', receta: recetaActualizada });
        } catch (error) {
            res.status(500).json({ error: 'Error al eliminar el archivo', detalle: error.message });
        }
    }
}

module.exports = RecetasController;
