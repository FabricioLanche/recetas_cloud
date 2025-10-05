const Receta = require('../models/recetaModel');
const Medico = require('../models/medicosModel');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const PDFParser = require("pdf2json");
const axios = require('axios');

// Configuración S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: 'us-east-1',
});

function extraerTextoDePDF(buffer) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => {
            let texto = "";
            if (pdfData && pdfData.formImage && pdfData.formImage.Pages) {
                pdfData.formImage.Pages.forEach(page => {
                    page.Texts.forEach(text =>
                        texto += decodeURIComponent(text.R[0].T) + " "
                    );
                });
            }
            resolve(texto.trim());
        });
        pdfParser.parseBuffer(buffer);
    });
}

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
            if (!req.file) {
                return res.status(400).json({ error: 'Falta archivo PDF (campo archivoPDF)' });
            }

            // 1. Subir PDF a S3
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
            await s3.upload(params).promise();
            const archivoPDF = fileName;

            // 2. Leer el PDF y extraer campos
            const textoPDF = await extraerTextoDePDF(req.file.buffer);

            // 3. Parseo básico (ajusta los regex según formato del PDF generado)
            const pacienteDNI = (textoPDF.match(/Paciente DNI: (\d{8,12})/) || [])[1];
            const medicoCMP = (textoPDF.match(/Médico CMP: (\d+)/) || [])[1];
            const fechaEmision = (textoPDF.match(/Fecha de emisión: ([\d\-]+)/) || [])[1];

            // Productos: busca líneas tipo "- Código: 001, Nombre: Paracetamol, Cantidad: 20"
            const productos = [];
            const productoRegex = /- Código: (\w+), Nombre: ([^,]+), Cantidad: (\d+)/g;
            let prodMatch;
            while ((prodMatch = productoRegex.exec(textoPDF)) !== null) {
                productos.push({
                    codigoProducto: prodMatch[1],
                    nombre: prodMatch[2].trim(),
                    cantidad: Number(prodMatch[3])
                });
            }

            // 4. Validar datos extraídos
            if (!pacienteDNI || !medicoCMP || !fechaEmision || productos.length === 0) {
                return res.status(400).json({ error: 'No se encontraron todos los campos requeridos en el PDF', detalle: { pacienteDNI, medicoCMP, fechaEmision, productos } });
            }

            // 5. Crear entrada en MongoDB
            const nuevaReceta = new Receta({
                pacienteDNI,
                medicoCMP,
                fechaEmision,
                productos,
                archivoPDF,
                estadoValidacion: 'pendiente'
            });

            await nuevaReceta.save();
            res.status(201).json({ mensaje: 'Receta subida correctamente', receta: nuevaReceta });
        } catch (error) {
            res.status(500).json({ error: 'Error al subir la receta', detalle: error.message });
        }
    },

    async actualizarEstadoReceta(req, res) {
        try {
            const recetaId = req.params.id;
            const { estadoValidacion, pacienteDNI, medicoCMP, fechaEmision, productos } = req.body;

            if (!recetaId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ error: 'ID de receta inválido' });
            }
            if (!['pendiente', 'validada', 'rechazada'].includes(estadoValidacion)) {
                return res.status(400).json({ error: 'Estado de validación inválido' });
            }

            // Buscar receta y su PDF
            const receta = await Receta.findById(recetaId);
            if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });

            // Validaciones de la lógica de negocio
            if (estadoValidacion === 'validada') {
                // Validar campos de receta
                if (!pacienteDNI || typeof pacienteDNI !== 'string' || pacienteDNI.length < 8  || pacienteDNI.length > 12) {
                    return res.status(400).json({ error: 'pacienteDNI inválido (debe ser string de 8-12 dígitos)' });
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
                // Regla de validez
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
                // Validar CMP
                const medico = await Medico.findOne({ cmp: medicoCMP, colegiaturaValida: true });
                if (!medico) {
                    return res.status(400).json({ error: 'CMP no registrado o colegiatura no válida' });
                }
                // Leer el PDF y hacer validación básica de contenido con pdf2json
                if (receta.archivoPDF) {
                    const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
                    const params = { Bucket: bucket, Key: receta.archivoPDF };
                    const pdfUrl = await s3.getSignedUrlPromise('getObject', params);

                    const pdfBuffer = (await axios.get(pdfUrl, { responseType: 'arraybuffer' })).data;
                    const textoPDF = await extraerTextoDePDF(pdfBuffer);

                    if (!textoPDF || textoPDF.length < 20) {
                        return res.status(400).json({ error: 'El PDF parece vacío o incompleto' });
                    }
                    if (!textoPDF.includes(pacienteDNI) || !textoPDF.includes(medicoCMP)) {
                        return res.status(400).json({ error: 'El PDF no contiene DNI/CMP esperados' });
                    }
                }
            }

            // Actualiza receta con los nuevos datos y estado
            const recetaActualizada = await Receta.findByIdAndUpdate(
                recetaId,
                {
                    pacienteDNI,
                    medicoCMP,
                    fechaEmision,
                    productos,
                    estadoValidacion
                },
                { new: true, runValidators: true }
            );
            res.json({ mensaje: 'Estado actualizado', receta: recetaActualizada });
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

            const key = receta.archivoPDF;
            const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
            if (!bucket) {
                return res.status(500).json({ error: 'Falta configuración del bucket S3' });
            }
            const params = { Bucket: bucket, Key: key };
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
                const key = receta.archivoPDF;
                const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
                if (bucket) {
                    const params = {
                        Bucket: bucket,
                        Key: key
                        // Eliminamos Expires
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