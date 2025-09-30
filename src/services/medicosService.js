const Medico = require('../models/medicosModel');

const medicosService = {
    async listarMedicos(req, res) {
        try {
            const {
                nombre,
                especialidad,
                colegiaturaValida,
                page = '1',
                limit = '10',
                sort = 'nombre'
            } = req.query;

            const filtro = {};
            if (nombre) filtro.nombre = { $regex: nombre, $options: 'i' };
            if (especialidad) filtro.especialidad = { $regex: especialidad, $options: 'i' };
            if (colegiaturaValida !== undefined) filtro.colegiaturaValida = colegiaturaValida === 'true';

            const pagina = Math.max(parseInt(page, 10) || 1, 1);
            const tamano = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

            const sortObj = {};
            const camposSort = String(sort).split(',');
            for (const campo of camposSort) {
                const c = campo.trim();
                if (!c) continue;
                if (c.startsWith('-')) sortObj[c.substring(1)] = -1; else sortObj[c] = 1;
            }

            const [items, total] = await Promise.all([
                Medico.find(filtro)
                    .sort(sortObj)
                    .skip((pagina - 1) * tamano)
                    .limit(tamano),
                Medico.countDocuments(filtro)
            ]);

            res.json({
                page: pagina,
                limit: tamano,
                total,
                items
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al listar médicos', detalle: error.message });
        }
    }
};

module.exports = medicosService;