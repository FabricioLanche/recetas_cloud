const axios = require('axios');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN, // 🔑 necesario en AWS Academy
  region: process.env.AWS_REGION || 'us-east-1',
});

const servicioIntegracion = {
  verificarCMPElMedico: async (cmp) => {
    try {
      const response = await axios.get(`http://doctor-service/api/doctors/${cmp}`);
      return response.data.isValid;
    } catch (error) {
      console.error('❌ Error verificando CMP del médico:', error.message);
      throw new Error('No se pudo validar el CMP del médico');
    }
  },

  verificarDNIDelPaciente: async (dni) => {
    try {
      const response = await axios.get(`http://patient-service/api/patients/${dni}`);
      return response.data.isValid;
    } catch (error) {
      console.error('❌ Error verificando DNI del paciente:', error.message);
      throw new Error('No se pudo validar el DNI del paciente');
    }
  },

  subirPDFaS3: async (file) => {
    try {
      const fileExtension = path.extname(file.originalname);
      const fileName = `recetas/${uuidv4()}${fileExtension}`;

      const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
      if (!bucket) {
        console.error('❌ Falta configurar el bucket S3. Define AWS_S3_BUCKET o BUCKET_NAME en el .env');
        throw new Error('Falta configuración del bucket S3');
      }

      const params = {
        Bucket: bucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      const data = await s3.upload(params).promise();
      console.log(`✅ Archivo subido a S3: ${data.Location}`);
      return data.Location;
    } catch (error) {
      console.error('❌ Error subiendo archivo a S3:', error.message);
      throw new Error('No se pudo subir el archivo a S3');
    }
  },

  eliminarArchivoDeS3: async (fileUrl) => {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1); // elimina "/" inicial

      const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
      if (!bucket) {
        console.error('❌ Falta configurar el bucket S3. Define AWS_S3_BUCKET o BUCKET_NAME en el .env');
        throw new Error('Falta configuración del bucket S3');
      }

      const params = {
        Bucket: bucket,
        Key: key,
      };

      await s3.deleteObject(params).promise();
      console.log(`🗑️ Archivo eliminado de S3: ${fileUrl}`);
    } catch (error) {
      console.error('❌ Error eliminando archivo de S3:', error.message);
      throw new Error('No se pudo eliminar el archivo de S3');
    }
  },

  // Generar URL prefirmada para descargar/visualizar el archivo (bucket privado)
  generarUrlPresignadaDescarga: async (fileUrl, segundosExpiracion = 300) => {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1);
      const bucket = process.env.AWS_S3_BUCKET || process.env.BUCKET_NAME;
      if (!bucket) {
        console.error('❌ Falta configurar el bucket S3. Define AWS_S3_BUCKET o BUCKET_NAME en el .env');
        throw new Error('Falta configuración del bucket S3');
      }

      const params = {
        Bucket: bucket,
        Key: key,
        Expires: segundosExpiracion,
      };
      const urlFirmada = await s3.getSignedUrlPromise('getObject', params);
      return urlFirmada;
    } catch (error) {
      console.error('❌ Error generando URL prefirmada:', error.message);
      throw new Error('No se pudo generar la URL prefirmada');
    }
  }
};

module.exports = servicioIntegracion;
