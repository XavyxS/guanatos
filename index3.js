const express = require('express');
const session = require('express-session');
const app = express();


app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 3600000 }
}));

function autenticar(req, res) {
  let profileid;
  let tokenid;
  if (req.session.profileid && req.session.tokenid) {
    profileid = req.session.profileid;
    tokenid = req.session.tokenid;
    const user_name = profileid.name; // Asignar valores a user_name y user_id
    const user_id = profileid.id;

    res.send(`El id del usuario es: ${user_id} y su nombre es: ${user_name} y su token es: ${tokenid.token}`);
  } else {
    //
    user_id = 12345678;
    user_name = 'Enlacell'; // Asignar valores a user_name y user_id
    profileid = {id: user_id, name: user_name};
    tokenid = {token: 'SDLKSLKDKS-ASDKASDJ-1121212', expira: 36000};
    req.session.tokenid = tokenid;
    req.session.profileid = profileid;
    res.send('Datos del Usuario actualizados');
  }
  return { profileid, tokenid }; // Retornar un objeto con user_name y user_id
}

app.get('/', (req, res) => {
  const {profileid, tokenid} = autenticar(req, res);
  console.log(profileid);
  console.log(tokenid);
});
  
app.listen(3000, () => {
  console.log('Servidor escuchando en el puerto 3000');
});
