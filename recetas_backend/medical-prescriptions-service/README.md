# Medical Prescriptions Service

This microservice is designed for managing valid medical prescriptions in a cloud-based pharmacy application. It utilizes MongoDB for data storage and integrates with other microservices to ensure the validity of prescriptions.

## Features

- Upload and validate medical prescriptions.
- Update the status of prescriptions.
- Integration with external microservices for validating doctor and patient information.

## Project Structure

```
medical-prescriptions-service
├── src
│   ├── app.js                # Entry point of the microservice
│   ├── controllers           # Contains controllers for handling requests
│   │   └── prescriptionsController.js
│   ├── models                # Mongoose models for data representation
│   │   └── prescription.js
│   ├── routes                # API routes for the microservice
│   │   └── prescriptions.js
│   ├── services              # Integration services for external APIs
│   │   └── integrationService.js
│   └── config                # Configuration files
│       └── db.js
├── package.json              # NPM package configuration
├── .env                      # Environment variables
└── README.md                 # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone https://github.com/Jhogan563P/recetas_cloud.git
   cd recetas_cloud/medical-prescriptions-service
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add your MongoDB connection string and any other necessary environment variables.

4. Start the application:
   ```
   npm start
   ```

## Usage

- **Upload Prescription**: POST `/prescriptions/upload`
- **Validate Prescription**: POST `/prescriptions/validate`
- **Update Prescription Status**: PUT `/prescriptions/update/:id`

## Integration

This microservice integrates with other microservices to validate doctor and patient information. Ensure that the respective services are running and accessible.

## License

This project is licensed under the ISC License.