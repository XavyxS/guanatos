const axios = require('axios'); // Asegúrate de importar axios
const mysql = require('mysql2/promise'); // Importa mysql2

function sanitizeDatabaseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, ''); // Eliminar todos los caracteres no válidos
}

// Función para crear la base de datos y tabla si no existen
async function verificarOCrearBD(profileid) {
    const dbName = sanitizeDatabaseName(`${profileid.nickname}_${profileid.id}`);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    // Crear la base de datos si no existe
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);

    // Conectar a la base de datos específica
    await connection.query(`USE ${dbName}`);

    // Crear la tabla 'questions' si no existe
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            _id VARCHAR(255),
            resource VARCHAR(255),
            topic VARCHAR(50),
            application_id VARCHAR(30),
            attempts INT,
            sent DATETIME(3),
            received DATETIME(3),
            user_id VARCHAR(45)
        );
    `;
    await connection.query(createTableQuery);
    await connection.end();
}

// Modificación en la función autenticar
async function autenticar(req, res, nextUrl) {
    if (req.session.profileid) {
        const created_at = new Date(req.session.tokenid.created_at);
        const current_date = new Date();
        const fiveHoursInMillis = 5 * 60 * 60 * 1000;
        
        if (current_date - created_at >= fiveHoursInMillis) { // Vamos a renovar el token
            const refresh_token = req.session.tokenid.refresh_token;
            try {
                const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
                    params: {
                        grant_type: 'refresh_token',
                        client_id: process.env.CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        refresh_token: refresh_token
                    },
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded'
                    }
                });

                const tokenid = response.data;
                req.session.tokenid = {
                    ...tokenid,
                    created_at: new Date().toISOString()
                };
                req.session.profileid = req.session.profileid;
                console.log('El usuario ya existe y se renovó el token');
                
                // VERIFICAR LA EXISTENCIA DE LA BD Y CREARLA SI NO EXISTE
                await verificarOCrearBD(req.session.profileid);

                return req.session.tokenid;
            } catch (error) {
                console.error('Error al renovar el token:', error);
                return null;
            }
        } else {
            req.session.profileid = req.session.profileid;
            console.log('El usuario ya existe');
            
            // VERIFICAR LA EXISTENCIA DE LA BD Y CREARLA SI NO EXISTE
            await verificarOCrearBD(req.session.profileid);

            return req.session.tokenid;
        }
    } else {
        req.session.nextUrl = nextUrl;
        res.redirect(`https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}`);
        return null;
    }
}

async function handleAuthCallback(req, res) {
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

        const tokenid = response.data;
        const access_token = tokenid.access_token;
        const userInfoResponse = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });

        const profileid = userInfoResponse.data;
        req.session.tokenid = {
            ...tokenid,
            created_at: new Date().toISOString()
        };
        req.session.profileid = profileid;

        console.log('Profile ID almacenado en handleAuthCallback:', profileid);

        const nextUrl = req.session.nextUrl || '/dashboard';
        res.redirect(nextUrl);
    } catch (error) {
        res.status(500).send(`<h1>Error during authorization</h1><p>${error.response ? error.response.data : error.message}</p>`);
    }
}

module.exports = {
    autenticar,
    handleAuthCallback
};
