const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { autenticar, handleAuthCallback } = require('./auth'); // Importar las funciones de auth.js

dotenv.config();
const app = express();

app.use(express.static('public'));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: (30 * 24 * 60 * 60 * 1000) }
}));

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
app.post('/callback', (req, res) => {
    const notification = req.body;
    const profileid = req.session.profileid;
    console.log(`Usuario:\n${profileid.nickname}`);
    console.log("Notificación recibida", notification);
    res.status(200).send('Notification received');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
