const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { autenticar, handleAuthCallback } = require('./auth'); // Importar las funciones de auth.js

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
    console.log('Estado de la sesión:', req.session);
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

// Ruta para manejar las notificaciones de Mercado Libre
app.post('/callback', async (req, res) => {
    console.log('Recibiendo notificación en /callback');
    console.log('Estado de la sesión en /callback:', req.session);

    // Verificar si hay una redirección antes de continuar
    const tokenid = await autenticar(req, res, '/callback');
    if (!tokenid) {
        return; // Si ya se envió una respuesta (redirección), no continuar
    }

    const notification = req.body;

    // Verificar si profileid está definido en la sesión
    if (!req.session.profileid) {
        console.error('profileid no está definido en la sesión.');
        return res.status(400).send('profileid no está definido en la sesión.');
    }

    console.log(`Usuario:\n${req.session.profileid.nickname}`);
    console.log("Notificación recibida", notification);
    res.status(200).send('Notification received');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
