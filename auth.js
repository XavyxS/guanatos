const axios = require('axios');

// Definir variables globales
global.globalTokenid = null;
global.globalProfileid = null;

async function autenticar(req, res, nextUrl) {
    if (req.session.profileid) {
        const created_at = new Date(req.session.tokenid.created_at);
        const current_date = new Date();
        const fiveHoursInMillis = 5 * 60 * 60 * 1000;
        
        if (current_date - created_at >= fiveHoursInMillis) {
            const refresh_token = req.session.tokenid.refresh_token;
            try {
                console.log('Renovando token...');
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
                // Asignar valores a las variables globales
                global.globalTokenid = tokenid;
                global.globalProfileid = req.session.profileid;
                console.log('Token renovado:', tokenid);
                return req.session.tokenid;
            } catch (error) {
                console.error('Error al renovar el token:', error);
                return null;
            }
        } else {
            console.log('Token actual aún válido');
            req.session.profileid = req.session.profileid;
            // Asignar valores a las variables globales
            global.globalTokenid = req.session.tokenid;
            global.globalProfileid = req.session.profileid;
            return req.session.tokenid;
        }
    } else {
        console.log('Redirigiendo para autenticación...');
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
        console.log('Obteniendo token usando el código...');
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
        console.log('Token obtenido:', tokenid);

        console.log('Obteniendo información del usuario...');
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

        // Asignar valores a las variables globales
        global.globalTokenid = tokenid;
        global.globalProfileid = profileid;

        console.log('Profile ID almacenado en handleAuthCallback:', profileid);

        const nextUrl = req.session.nextUrl || '/dashboard';
        res.redirect(nextUrl);
    } catch (error) {
        console.error('Error durante la autorización:', error.response ? error.response.data : error.message);
        res.status(500).send(`<h1>Error durante la autorización</h1><p>${error.response ? error.response.data : error.message}</p>`);
    }
}

module.exports = {
    autenticar,
    handleAuthCallback
};
