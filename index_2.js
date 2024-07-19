const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const mysql = require('mysql2');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { getValidAccessToken } = require('./utils'); // Importar la función de utilidad
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configuración de la conexión a la base de datos usando un pool
const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());
app.set('trust proxy', 1); // trust first proxy

// Configuración de la sesión
app.use(session({
  secret: process.env.SESSION_SECRET, // Clave secreta segura
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Cambiar a true si usas HTTPS
    httpOnly: true, // Mitigar el riesgo de ataques XSS
    maxAge: 3600000 // 1 hora
  }
}));

// Middleware para registrar cookies y sesión en cada solicitud
app.use((req, res, next) => {
  console.log('Cookies: ', req.cookies);
  console.log('Session: ', req.session);
  next();
});


// Función para redirigir a la autenticación si current_user no está presente
function ensureAuthenticated(req, res, next) {
  if (!req.session.current_user) {
    return res.redirect(`https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}`);
  }
  next();
}


// Ruta de auth para manejar el code de autorización.
app.get('/auth', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.REDIRECT_URI
      },
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in, user_id, scope, token_type } = response.data;

    const newToken = {
      user_id,
      access_token,
      refresh_token,
      expires_in,
      scope,
      token_type,
      created_at: Date.now()
    };

    // Guardar el user_id y access_token en la sesión
    req.session.current_user = user_id;
    req.session.access_token = access_token;

    const checkQuery = 'SELECT * FROM tokens WHERE user_id = ?';
    connection.query(checkQuery, [user_id], async (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).send('Error checking user_id in the database');
      }

      if (checkResults.length > 0) {
        const updateQuery = `
          UPDATE tokens
          SET access_token = ?, refresh_token = ?, expires_in = ?, scope = ?, token_type = ?, created_at = ?
          WHERE user_id = ?
        `;
        connection.query(updateQuery, [access_token, refresh_token, expires_in, scope, token_type, newToken.created_at, user_id], (updateError, updateResults) => {
          if (updateError) {
            return res.status(500).send('Error updating tokens in the database');
          }
        });
      } else {
        const query = 'INSERT INTO tokens SET ?';
        connection.query(query, newToken, (error, results) => {
          if (error) {
            return res.status(500).send('Error storing tokens in the database');
          }
        });
      }

      // Obtener información del vendedor
      try {
        const userInfoResponse = await axios.get('https://api.mercadolibre.com/users/me', {
          headers: {
            Authorization: `Bearer ${access_token}`
          }
        });

        const userInfo = userInfoResponse.data;

        // Guardar información relevante del vendedor en la sesión
        req.session.user_info = {
          nickname: userInfo.nickname,
          email: userInfo.email,
          address: userInfo.address,
          phone: userInfo.phone,
          permalink: userInfo.permalink,
          seller_reputation: userInfo.seller_reputation,
          status: userInfo.status,
          site_status: userInfo.site_status,
          company: userInfo.company
        };

        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            return res.status(500).send('Error saving session');
          }
          console.log("Datos del usuario guardados en la sesión: ", req.session);
          return res.redirect(`/dashboard`);
        });

      } catch (userInfoError) {
        console.error('Error fetching user info:', userInfoError);
        return res.status(500).send('Error fetching user info');
      }
    });
  } catch (error) {
    res.status(500).send(`<h1>Error during authorization</h1><p>${error.response ? error.response.data : error.message}</p>`);
  }
});

// Ruta para servir index.html en el directorio raíz
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Ruta para mostrar el dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Ruta para obtener las campañas activas
app.get('/campaigns', ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/campaigns.html');
});

// API para obtener las campañas activas
app.get('/api/campaigns', async (req, res) => {
  const user_id = req.session.current_user;
  if (!user_id) {
    return res.status(400).send('User ID not found in session');
  }

  try {
    const access_token = await getValidAccessToken(user_id);
    const response = await axios.get(`https://api.mercadolibre.com/seller-promotions/users/${user_id}?app_version=v2`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    console.log('Campañas obtenidas:', response.data); // Agregar registro para verificar la respuesta
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching campaigns:', error); // Agregar registro para verificar errores
    res.status(500).send(`Error fetching campaigns: ${error.response ? error.response.data : error.message}`);
  }
});

// API para obtener la información del usuario
app.get('/api/user_info', ensureAuthenticated, (req, res) => {
  res.status(200).json(req.session.user_info);
});

// Ruta para manejar las notificaciones de Mercado Libre
app.post('/callback', (req, res) => {
  const notification = req.body;

  console.log("Notificación recibida", notification);

  // Convertir las fechas a un formato aceptable para MySQL
  const sent = new Date(notification.sent).toISOString().slice(0, 19).replace('T', ' ');
  const received = new Date(notification.received).toISOString().slice(0, 19).replace('T', ' ');

  const query = `
    INSERT INTO notifications (_id, resource, topic, application_id, attempts, sent, received, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    notification._id,
    notification.resource,
    notification.topic,
    notification.application_id,
    notification.attempts,
    sent,
    received,
    notification.user_id
  ];

  connection.query(query, values, (error, results) => {
    if (error) {
      console.error('Error storing notification:', error);
      return res.status(500).send('Error storing notification');
    }
    res.status(200).send('Notification received and stored');
  });
});


// Ruta para obtener las preguntas
app.get('/questions', ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/questions.html');
});


// Ruta para obtener las preguntas del usuario actual
app.get('/api/questions', async (req, res) => {
  const user_id = req.session.current_user;

  if (!user_id) {
    return res.status(400).send('User ID not found in session');
  }

  const notificationsQuery = `
    SELECT resource, MAX(received) as most_recent
    FROM notifications
    WHERE user_id = ? AND topic = 'questions'
    GROUP BY resource
  `;

  connection.query(notificationsQuery, [user_id], async (error, results) => {
    if (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).send('Error fetching notifications');
    }

    const questions = [];

    for (const notification of results) {
      const questionId = notification.resource.split('/').pop();
      const access_token = await getValidAccessToken(user_id);

      try {
        const response = await axios.get(`https://api.mercadolibre.com/questions/${questionId}`, {
          headers: {
            'Authorization': `Bearer ${access_token}`
          }
        });
        question_data = response.data;
        if (question_data.status === 'UNANSWERED'){ //Vamos a filtrar sólo las preguntas que no han sido respondidas
          questions.push(response.data);
        };
      } catch (error) {
        console.error('Error fetching question:', error);
      }
    }

    res.status(200).json(questions);
  });
});


// Ruta para responder preguntas
app.post('/api/answer', async (req, res) => {
  const { question_id, text } = req.body;
  const user_id = req.session.current_user;

  if (!user_id) {
    return res.status(400).send('User ID not found in session');
  }

  try {
    const access_token = await getValidAccessToken(user_id);

    const response = await axios.post('https://api.mercadolibre.com/answers', {
      question_id,
      text
    }, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    // Eliminar las notificaciones relacionadas con la pregunta respondida
    const deleteQuery = `
      DELETE FROM notifications
      WHERE resource LIKE ?
    `;
    connection.query(deleteQuery, [`%/questions/${question_id}`], (deleteError, deleteResults) => {
      if (deleteError) {
        console.error('Error deleting notifications:', deleteError);
        return res.status(500).json({ message: 'Error deleting notifications' });
      }
      console.log('Notificaciones eliminadas:', deleteResults.affectedRows);
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error sending answer:', error);
    res.status(500).json({ message: error.response ? error.response.data : error.message });
  }
});


// Ruta para obtener información de usuario
app.get('/api/user_data', async (req, res) => {
  const { user_id } = req.query;
  const current_user = req.session.current_user;

  if (!current_user) {
    return res.status(400).send('User ID not found in session');
  }

  try {
    const access_token = await getValidAccessToken(current_user);
    const response = await axios.get(`https://api.mercadolibre.com/users/${user_id}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: error.response ? error.response.data : error.message });
  }
});

// Ruta para obtener información del artículo
app.get('/api/item_info', async (req, res) => {
  const { item_id } = req.query;
  const current_user = req.session.current_user;

  if (!current_user) {
    return res.status(400).send('User ID not found in session');
  }

  try {
    const access_token = await getValidAccessToken(current_user);
    const response = await axios.get(`https://api.mercadolibre.com/items/${item_id}?include_attributes=all`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching item info:', error);
    res.status(500).json({ message: error.response ? error.response.data : error.message });
  }
});

// Inicia el servidor en el puerto especificado.
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
