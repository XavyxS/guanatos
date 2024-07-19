const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const { autenticar, handleAuthCallback } = require('./auth');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function sanitizeDatabaseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, ''); // Eliminar todos los caracteres no válidos
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/dashboard', autenticar, (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/questions', autenticar, (req, res) => {
    res.sendFile(__dirname + '/public/questions.html');
});

app.get('/auth', handleAuthCallback);

// Nueva ruta para recibir notificaciones
app.post('/callback', async (req, res) => {
    const notification = req.body;

    try {
        // Convertir las fechas a un formato aceptable para MySQL
        const sent = new Date(notification.sent).toISOString().slice(0, 19).replace('T', ' ');
        const received = new Date(notification.received).toISOString().slice(0, 19).replace('T', ' ');

        const connection = await pool.getConnection();

        try {
            // Obtener el nombre de la base de datos que termina con el user_id
            const [databases] = await connection.query('SHOW DATABASES');
            const dbName = databases
                .map(db => db.Database)
                .find(db => db.endsWith(`_${notification.user_id}`));

            if (!dbName) {
                throw new Error(`No se encontró ninguna base de datos que termine en _${notification.user_id}`);
            }

            // Usar la base de datos específica
            await connection.query(`USE ${sanitizeDatabaseName(dbName)}`);

            // Insertar la notificación en la tabla correspondiente
            const insertQuery = `
                INSERT INTO ${notification.topic} (_id, resource, topic, application_id, attempts, sent, received, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await connection.query(insertQuery, [
                notification._id,
                notification.resource,
                notification.topic,
                notification.application_id,
                notification.attempts,
                sent,
                received,
                notification.user_id
            ]);

            res.status(200).send('Notification received and processed');
        } finally {
            connection.release(); // Liberar la conexión de vuelta al pool
        }
    } catch (error) {
        console.error('Error processing notification:', error);
        res.status(500).send('Error processing notification');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
