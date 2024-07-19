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

// Función para generar el SQL de creación de tabla
function generateCreateTableSQL(tableName) {
    return `
        CREATE TABLE IF NOT EXISTS \`${tableName}\` (
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
}

function createDatabaseAndTables(profileid) {
    const userid = profileid.id;
    const nickname = sanitizeDatabaseName(profileid.nickname);
    const dbName = `${nickname}${userid}`;
    const tables = [
        'items',
        'payments',
        'orders_feedback',
        'claims',
        'orders_v2',
        'items_prices',
        'shipments',
        'fbm_stock_operations',
        'messages',
        'questions',
        'stock_locations'
    ];

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

                // Usar el pool para obtener una conexión a la base de datos específica
                pool.getConnection((err, dbConnection) => {
                    if (err) {
                        console.error('Error conectando a la base de datos', err.stack);
                        connection.release();
                        return reject(err);
                    }
                    dbConnection.changeUser({database: dbName}, async (err) => {
                        if (err) {
                            console.error('Error cambiando de base de datos:', err.stack);
                            dbConnection.release();
                            connection.release();
                            return reject(err);
                        }
                        console.log('Conectado a la base de datos específica.');

                        // Crear todas las tablas
                        try {
                            for (const table of tables) {
                                const createTableQuery = generateCreateTableSQL(table);
                                await dbConnection.promise().query(createTableQuery);
                                console.log(`Tabla "${table}" creada o ya existe.`);
                            }
                            dbConnection.release();
                            connection.release();
                            resolve();
                        } catch (err) {
                            console.error('Error al crear las tablas:', err.stack);
                            dbConnection.release();
                            connection.release();
                            return reject(err);
                        }
                    });
                });
            });
        });
    });
}

module.exports = {
    createDatabaseAndTables
};
