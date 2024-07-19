const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();


// Crear una conexión a MySQL
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const userid = req.session.profileid.id;
const nickname = req.session.profileid.nickname;
const dbName = nickname + userid;


// Conectar a MySQL
connection.connect(err => {
    if (err) {
        console.error('Error conectando a MySQL:', err.stack);
        return;
    }
    console.log('Conectado a MySQL como id ' + connection.threadId);

    // Crear la base de datos 'escuela' si no existe
    connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`, (err, results) => {
        if (err) {
            console.error('Error al crear la base de datos:', err.stack);
            return;
        }
        console.log(`Base de datos ${dbName} creada o ya existe`);

        // Cerrar la conexión inicial
        connection.end(err => {
            if (err) {
                console.error('Error cerrando la conexión inicial a MySQL:', err.stack);
                return;
            }
            console.log('Conexión inicial a MySQL cerrada.');

            // Crear una nueva conexión especificando la base de datos
            const dbConnection = mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: dbName    // Especifica la base de datos
            });

            dbConnection.connect(err => {
                if (err) {
                    console.error('Error conectando a la base de datos', err.stack);
                    return;
                }
                console.log('Conectado a la base de datos.');

                // Crear la tabla 'questions' si no existe
                const createTableQuery = `
                    CREATE TABLE IF NOT EXISTS questions (
                    id int AI PK,
                    _id varchar(255),
                    resource varchar(255), 
                    topic varchar(50),
                    application_id varchar(30), 
                    attempts int,
                    sent datetime(3), 
                    received datetime(3), 
                    user_id varchar(45)
                )`;

                dbConnection.query(createTableQuery, (err, results) => {
                    if (err) {
                        console.error('Error al crear la tabla "questions":', err.stack);
                        return;
                    }
                    console.log('Tabla "questions" creada o ya existe.');

                    
                });
            });
        });
    });
});
