const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // 1. Importar cors
const dbConfig = require('./config/dbConfig');
const medicosController = require('./controllers/medicosController');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi.json');
const recetasController = require('./controllers/recetasController');
const Receta = require('./models/recetaModel');
const Medico = require('./models/medicosModel');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // 2. Usar cors
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
console.log('[APP] dbConfig.url =', dbConfig.url);
console.log('[APP] dbConfig.options =', dbConfig.options);

mongoose.connect(dbConfig.url, dbConfig.options)
    .then(async () => {
        console.log('MongoDB connected successfully');

        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        if (!collectionNames.includes(Receta.collection.name)) {
            await mongoose.connection.createCollection(Receta.collection.name);
            console.log('[DB] Colección "recetas" creada');
        }

        if (!collectionNames.includes(Medico.collection.name)) {
            await mongoose.connection.createCollection(Medico.collection.name);
            console.log('[DB] Colección "medicos" creada');
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });
// Documentación OpenAPI (Swagger) en JSON
app.use('/api/recetas/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Rutas
app.use('/api/recetas', recetasController);
app.use('/api/medicos', medicosController);

// Endpoint de eco (echo): útil para pruebas de liveness del contenedor o balanceadores
app.get('/echo', (req, res) => {
    res.json({ status: 'ok', service: 'medical-prescriptions-service', time: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
