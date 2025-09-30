const express = require('express');
const router = express.Router();
const medicosService = require('../services/medicosService');

router.get('/filter', medicosService.listarMedicos);

module.exports = router;