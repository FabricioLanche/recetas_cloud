const Receta = require('../models/recetaModel');
const Medico = require('../models/medicosModel');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuración S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: 'us-east-1',
});

const recetasService = {
    // Listar recetas con filtros y paginación
    async listarRecetas(req, res) {
        try {
            const {
                dni,
                cmp,
                estado,
                page = '1',
                pagesize = '10'
            } = req.query;

            const filtro = {};
            if (dni) filtro.pacienteDNI = String(dni);
            if (cmp) filtro.medicoCMP = String(cmp);
            if (estado) filtro.estadoValidacion = String(estado);

            const pagina = Math.max(parseInt(page, 10) || 1, 1);
            const tamano = Math.min(Math.max(parseInt(pagesize, 10) || 10, 1), 100);

            // Ordenar por fecha de creación descendente por defecto
            const sortObj = { createdAt: -1 };

            const [items, total] = await Promise.all([
                Receta.find(filtro)
                    .sort(sortObj)
                    .skip((pagina - 1) * tamano)
                    .limit(tamano),
                Receta.countDocuments(filtro)
            ]);

            res.json({
                page: pagina,
                pagesize: tamano,
                total,
                items
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al listar recetas', detalle: error.message });
        }
    },

    // Subir receta PDF
    async subirReceta(req, res) {
        try {
            let { pacienteDNI, medicoCMP, fechaEmision, productos } = req.body;
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

            //Validar CMP contra la colección de médicos
            const medico = await Medico.findOne({ cmp: medicoCMP, colegiaturaValida: true });
            if (!medico) {
                return res.status(400).json({ error: 'CMP no registrado o colegiatura no válida' });
            }

            // Subir PDF a S3
            const fileExtension = path.extname(req.file.originalname);
            const fileName = `recetas/${uuidv4()}${fileExtension}`;
            const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
            if (!bucket) {
                return res.status(500).json({ error: 'Falta configuración del bucket S3' });
            }
            const params = {
                Bucket: bucket,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            const data = await s3.upload(params).promise();
            const archivoPDF = data.Location;

            // Crear receta en MongoDB
            const nuevaReceta = new Receta({
                pacienteDNI,
                medicoCMP,
                fechaEmision,
                productos: productos.map(p => ({
                    codigoProducto: p.codigoProducto,
                    nombre: p.nombre,
                    cantidad: Number(p.cantidad)
                })),
                archivoPDF
            });

            await nuevaReceta.save();
            res.status(201).json({ mensaje: 'Receta subida correctamente', receta: nuevaReceta });
        } catch (error) {
            res.status(500).json({ error: 'Error al subir la receta', detalle: error.message });
        }
    },

    // Colapsa validación y actualización de estado en un solo método (PUT)
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
    },

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
            const urlObj = new URL(receta.archivoPDF);
            const key = urlObj.pathname.substring(1);
            const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
            if (!bucket) {
                return res.status(500).json({ error: 'Falta configuración del bucket S3' });
            }
            const params = {
                Bucket: bucket,
                Key: key,
            };
            await s3.deleteObject(params).promise();

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
    },

    async obtenerRecetaPorId(req, res) {
        try {
            const { id } = req.params;
            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }
            const receta = await Receta.findById(id);
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });

            let pdfUrl = null;
            if (receta.archivoPDF) {
                // Generar URL prefirmada con expiración (por defecto 300s)
                const expires = req.query.expires ? Number(req.query.expires) : 300;
                const urlObj = new URL(receta.archivoPDF);
                const key = urlObj.pathname.substring(1);
                const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
                if (bucket) {
                    const params = {
                        Bucket: bucket,
                        Key: key,
                        Expires: expires,
                    };
                    pdfUrl = await s3.getSignedUrlPromise('getObject', params);
                }
            }

            res.json({
                ...receta.toObject(),
                pdfUrl
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener la receta', detalle: error.message });
        }
    },
};

module.exports = recetasService;