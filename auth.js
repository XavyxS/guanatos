const axios = require('axios');

async function autenticar(req, res, nextUrl) {
    if (req.session.profileid) {
        const created_at = new Date(req.session.tokenid.created_at);
        const current_date = new Date();
        const fiveHoursInMillis = 5 * 60 * 60 * 1000;
        
        if (current_date - created_at >= fiveHoursInMillis) {
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
                return req.session.tokenid;
            } catch (error) {
                console.error('Error al renovar el token:', error);
                return null;
            }
        } else {
            req.session.profileid = req.session.profileid;
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
