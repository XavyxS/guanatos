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