const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { autenticar, handleAuthCallback, pool } = require('./auth');

dotenv.config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Middleware para manejar datos de formularios
app.use(express.static('public'));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Asegúrate de no guardar sesiones no inicializadas
    cookie: { secure: false, httpOnly: true, maxAge: (30 * 24 * 60 * 60 * 1000) }
}));

// Middleware para imprimir el estado de la sesión
app.use((req, res, next) => {
    //console.log('Estado de la sesión:', req.session);
    next();
});


app.get('/auth', handleAuthCallback);

app.get('/dashboard', async (req, res) => {
    const tokenid = await autenticar(req, res, '/dashboard');
    if (tokenid) {
        const profileid = req.session.profileid;
        console.log(`Usuario:\n${profileid.nickname}`);
        console.log(`Token:\n${tokenid}`);
        res.sendFile(__dirname + '/public/dashboard.html');
    }
});

app.get('/questions', async (req, res) => {
    const tokenid = await autenticar(req, res, '/questions');
    if (tokenid) {
        res.sendFile(__dirname + '/public/questions.html');
    }
});


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
            console.log(`Las bases de datos son: ${databases} y el user_id es: ${notification.user_id}`);
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


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
