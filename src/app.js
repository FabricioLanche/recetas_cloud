const express = require('express');
const mongoose = require('mongoose');
const dbConfig = require('./config/dbConfig');
const medicosController = require('./controllers/medicosController');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi.json');
const recetasController = require('./controllers/recetasController'); // <-- ESTA ES LA CLAVE

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
console.log('[APP] dbConfig.url =', dbConfig.url);
console.log('[APP] dbConfig.options =', dbConfig.options);
mongoose.connect(dbConfig.url, dbConfig.options)
    .then(() => {
        console.log('MongoDB connected successfully');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

// Rutas
app.use('/api/recetas', recetasController);
app.use('/api/medicos', medicosController);

// Documentación OpenAPI (Swagger) en JSON
app.use('/api/recetas/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Endpoint de eco (echo): útil para pruebas de liveness del contenedor o balanceadores
app.get('/echo', (req, res) => {
    res.json({ status: 'ok', service: 'medical-prescriptions-service', time: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});