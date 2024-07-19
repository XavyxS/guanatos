const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// Crear un pool de conexiones a MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function sanitizeDatabaseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, ''); // Eliminar todos los caracteres no válidos
}

function createDatabaseAndTable(profileid) {
    const userid = profileid.id;
    const nickname = sanitizeDatabaseName(profileid.nickname);
    const dbName = `${nickname}_${userid}`;

    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                console.error('Error obteniendo conexión del pool:', err.stack);
                return reject(err);
            }
            console.log('Conectado a MySQL como id ' + connection.threadId);

            // Crear la base de datos si no existe
            connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``, (err, results) => {
                if (err) {
                    console.error('Error al crear la base de datos:', err.stack);
                    connection.release();
                    return reject(err);
                }
                console.log(`Base de datos ${dbName} creada o ya existe`);

                // Cambiar la base de datos de la conexión actual
                connection.changeUser({ database: dbName }, (err) => {
                    if (err) {
                        console.error('Error al cambiar de base de datos:', err.stack);
                        connection.release();
                        return reject(err);
                    }
                    console.log(`Conexión cambiada a la base de datos ${dbName}.`);

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
                        )`;

                    connection.query(createTableQuery, (err, results) => {
                        if (err) {
                            console.error('Error al crear la tabla "questions":', err.stack);
                            connection.release();
                            return reject(err);
                        }
                        console.log('Tabla "questions" creada o ya existe.');
                        connection.release();
                        resolve();
                    });
                });
            });
        });
    });
}

module.exports = {
    createDatabaseAndTable
};
