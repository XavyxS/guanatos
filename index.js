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
        console.log(`Valor globalTokenid:\n${global.globalTokenid}`);
        console.log(`Valor globalProfileid:\n${global.globalProfileid}`);
        res.sendFile(__dirname + '/public/dashboard.html');
    }
});

app.get('/questions', async (req, res) => {
    const tokenid = await autenticar(req, res, '/questions');
    if (tokenid) {
        console.log(`Valor globalTokenid en /questions:\n${global.globalTokenid}`);
        console.log(`Valor globalProfileid en /questions:\n${global.globalProfileid}`);
        res.sendFile(__dirname + '/public/questions.html');
    }
});

// Ruta para manejar las notificaciones de Mercado Libre
app.post('/callback', async (req, res) => {
    console.log('Recibiendo notificación en /callback');
    const notification = req.body;

    // Verificar si profileid está definido en las variables globales
    if (!global.globalProfileid) {
        console.error('globalProfileid no está definido.');
        return res.status(400).send('globalProfileid no está definido.');
    }

    const profileid = global.globalProfileid;
    console.log(`Usuario: ${profileid.nickname}`);
    console.log("Notificación recibida", notification);
    console.log(`Valor globalTokenid en /callback:\n${global.globalTokenid}`);
    console.log(`Valor globalProfileid en /callback:\n${global.globalProfileid}`);
    res.status(200).send('Notification received');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
