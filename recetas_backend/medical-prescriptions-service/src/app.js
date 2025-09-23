const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const rutasRecetas = require('./routes/recetasRoutes');
const dbConfig = require('./config/db');
const openapi = require('./docs/openapi.json');

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

// Rutas (prefijo en español)
app.use('/api/recetas', rutasRecetas);

// Documentación OpenAPI (Swagger) en JSON
app.get('/api/docs.json', (req, res) => {
    res.json(openapi);
});

// Endpoint de eco (echo): útil para pruebas de liveness del contenedor o balanceadores
app.get('/api/echo', (req, res) => {
    res.json({ status: 'ok', service: 'medical-prescriptions-service', time: new Date().toISOString() });
});

// Endpoint de salud de la aplicación (health): verifica estado de conexión a Mongo
app.get('/api/health', (req, res) => {
    const estadoMongo = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    const healthy = estadoMongo === 1;
    const detalle = { mongoReadyState: estadoMongo };
    if (healthy) return res.status(200).json({ status: 'healthy', detalle });
    return res.status(503).json({ status: 'unhealthy', detalle });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});