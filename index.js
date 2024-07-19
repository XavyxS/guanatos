const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
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

function sanitizeDatabaseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, ''); // Eliminar todos los caracteres no válidos
}

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
    console.log("Notificación recibida", notification);

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

            // Verificar si la tabla especificada en el topic existe
            const [tables] = await connection.query('SHOW TABLES LIKE ?', [notification.topic]);
            const tableName = tables.length > 0 ? notification.topic : 'others';

            // Insertar la notificación en la tabla correspondiente
            const insertQuery = `
                INSERT INTO ${tableName} (_id, resource, topic, application_id, attempts, sent, received, user_id)
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

// Nueva ruta para manejar notificaciones de preguntas
app.get('/api/questions', async (req, res) => {
    const tokenid = await autenticar(req, res, '/questions');
    if (!tokenid) {
        return res.status(400).send('User ID not found in session');
    }

    try {
        const connection = await pool.getConnection();

        try {
            // Obtener el nombre de la base de datos que termina con el user_id
            const [databases] = await connection.query('SHOW DATABASES');
            const dbName = databases
                .map(db => db.Database)
                .find(db => db.endsWith(`_${tokenid.user_id}`));

            if (!dbName) {
                throw new Error(`No se encontró ninguna base de datos que termine en _${tokenid.user_id}`);
            }

            // Usar la base de datos específica
            await connection.query(`USE ${sanitizeDatabaseName(dbName)}`);

            // Leer los registros de la tabla "questions"
            const [rows] = await connection.query('SELECT * FROM questions');

            // Depurar los registros con campos "resource" repetidos
            const uniqueResources = {};
            rows.forEach(row => {
                if (!uniqueResources[row.resource] || new Date(uniqueResources[row.resource].received) < new Date(row.received)) {
                    uniqueResources[row.resource] = row;
                }
            });

            const resourcesToDelete = rows.filter(row => !uniqueResources[row.resource]);

            if (resourcesToDelete.length > 0) {
                const deleteQuery = 'DELETE FROM questions WHERE id IN (?)';
                await connection.query(deleteQuery, [resourcesToDelete.map(row => row.id)]);
            }

            const uniqueRows = Object.values(uniqueResources);

            // Consultar cada notificación para obtener los detalles de la pregunta
            const questions = [];
            for (const row of uniqueRows) {
                const questionId = row.resource.split('/').pop();
                const questionResponse = await axios.get(`https://api.mercadolibre.com/questions/${questionId}`, {
                    headers: {
                        Authorization: `Bearer ${tokenid.access_token}`
                    }
                });

                const questionData = questionResponse.data;

                if (questionData.status === 'ANSWERED') {
                    await connection.query('DELETE FROM questions WHERE id = ?', [row.id]);
                } else {
                    questions.push({
                        id: questionData.id,
                        from: questionData.from.id,
                        text: questionData.text,
                        date_created: questionData.date_created,
                        status: questionData.status,
                        item_id: questionData.item_id,
                        answer: questionData.answer || null
                    });
                }
            }

            res.json(questions);
        } finally {
            connection.release(); // Liberar la conexión de vuelta al pool
        }
    } catch (error) {
        console.error('Error processing questions:', error);
        res.status(500).send('Error processing questions');
    }
});

// Ruta para obtener información del usuario
app.get('/api/user_info', async (req, res) => {
    const tokenid = await autenticar(req, res, '/user_info');
    if (!tokenid) {
        return res.status(400).send('User ID not found in session');
    }

    try {
        const userInfoResponse = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: {
                Authorization: `Bearer ${tokenid.access_token}`
            }
        });

        res.json(userInfoResponse.data);
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).send('Error fetching user info');
    }
});

// Ruta para obtener información del artículo
app.get('/api/item_info', async (req, res) => {
    const tokenid = await autenticar(req, res, '/item_info');
    if (!tokenid) {
        return res.status(400).send('User ID not found in session');
    }

    const itemId = req.query.item_id;
    if (!itemId) {
        return res.status(400).send('Item ID is required');
    }

    try {
        const itemInfoResponse = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
            headers: {
                Authorization: `Bearer ${tokenid.access_token}`
            }
        });

        res.json(itemInfoResponse.data);
    } catch (error) {
        console.error('Error fetching item info:', error);
        res.status(500).send('Error fetching item info');
    }
});

// Ruta para responder preguntas
app.post('/api/answer', async (req, res) => {
    const { question_id, text } = req.body;
    const tokenid = await autenticar(req, res, '/answer');
    if (!tokenid) {
        return res.status(400).send('User ID not found in session');
    }

    try {
        const response = await axios.post('https://api.mercadolibre.com/answers', {
            question_id,
            text
        }, {
            headers: {
                'Authorization': `Bearer ${tokenid.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error sending answer:', error);
        res.status(500).json({ message: error.response ? error.response.data : error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
