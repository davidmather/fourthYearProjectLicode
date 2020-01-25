/* global require, __dirname, console */

/* eslint-disable import/no-extraneous-dependencies, no-console */

const express = require('express');
const bodyParser = require('body-parser');
const errorhandler = require('errorhandler');
const morgan = require('morgan');
// eslint-disable-next-line import/no-unresolved
const N = require('./nuve');
const fs = require('fs');
const https = require('https');
var socketIO = require('socket.io');
// eslint-disable-next-line import/no-unresolved
const config = require('./../../licode_config');

const options = {
  key: fs.readFileSync('../../cert/key.pem').toString(),
  cert: fs.readFileSync('../../cert/cert.pem').toString(),
};

if (config.erizoController.sslCaCerts) {
  options.ca = [];
  config.erizoController.sslCaCerts.forEach((cert) => {
    options.ca.push(fs.readFileSync(cert).toString());
  });
}

var app = require('./app');
// app.configure ya no existe
app.use(errorhandler({
  dumpExceptions: true,
  showStack: true,
}));
//app.use(morgan('dev'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


// app.set('views', __dirname + '/../views/');
// disable layout
// app.set("view options", {layout: false});

N.API.init(config.nuve.superserviceID, config.nuve.superserviceKey, 'http://localhost:3000/');

let defaultRoom;
const defaultRoomName = 'basicExampleRoom';

const getOrCreateRoom = (name, type = 'erizo', mediaConfiguration = 'default',
  callback = () => {}) => {
  if (name === defaultRoomName && defaultRoom) {
    callback(defaultRoom);
    return;
  }

  N.API.getRooms((roomlist) => {
    let theRoom = '';
    const rooms = JSON.parse(roomlist);
    for (let i = 0; i < rooms.length; i += 1) {
      const room = rooms[i];
      if (room.name === name &&
                room.data &&
                room.data.basicExampleRoom) {
        theRoom = room._id;
        callback(theRoom);
        return;
      }
    }
    const extra = { data: { basicExampleRoom: true }, mediaConfiguration };
    if (type === 'p2p') extra.p2p = true;

    N.API.createRoom(name, (roomID) => {
      theRoom = roomID._id;
      callback(theRoom);
    }, () => {}, extra);
  });
};

const deleteRoomsIfEmpty = (theRooms, callback) => {
  if (theRooms.length === 0) {
    callback(true);
    return;
  }
  const theRoomId = theRooms.pop()._id;
  N.API.getUsers(theRoomId, (userlist) => {
    const users = JSON.parse(userlist);
    if (Object.keys(users).length === 0) {
      N.API.deleteRoom(theRoomId, () => {
        deleteRoomsIfEmpty(theRooms, callback);
      });
    } else {
      deleteRoomsIfEmpty(theRooms, callback);
    }
  }, (error, status) => {
    console.log('Error getting user list for room ', theRoomId, 'reason: ', error);
    switch (status) {
      case 404:
        deleteRoomsIfEmpty(theRooms, callback);
        break;
      case 503:
        N.API.deleteRoom(theRoomId, () => {
          deleteRoomsIfEmpty(theRooms, callback);
        });
        break;
      default:
        break;
    }
  });
};

const cleanExampleRooms = (callback) => {
  console.log('Cleaning basic example rooms');
  N.API.getRooms((roomlist) => {
    const rooms = JSON.parse(roomlist);
    const roomsToCheck = [];
    rooms.forEach((aRoom) => {
      if (aRoom.data &&
                aRoom.data.basicExampleRoom &&
                aRoom.name !== defaultRoomName) {
        roomsToCheck.push(aRoom);
      }
    });
    deleteRoomsIfEmpty(roomsToCheck, () => {
      callback('done');
    });
  }, (err) => {
    console.log('Error cleaning example rooms', err);
    setTimeout(cleanExampleRooms.bind(this, callback), 3000);
  });
};

app.get('/getRooms/', (req, res) => {
  N.API.getRooms((rooms) => {
    res.send(rooms);
  });
});

app.get('/getUsers/:room', (req, res) => {
  const room = req.params.room;
  N.API.getUsers(room, (users) => {
    res.send(users);
  });
});


app.post('/createToken/', (req, res) => {
  console.log('Creating token. Request body: ', req.body);

  const username = req.body.username;
  const role = req.body.role;

  let room = defaultRoomName;
  let type;
  let roomId;
  let mediaConfiguration;

  if (req.body.room) room = req.body.room;
  if (req.body.type) type = req.body.type;
  if (req.body.roomId) roomId = req.body.roomId;
  if (req.body.mediaConfiguration) mediaConfiguration = req.body.mediaConfiguration;

  const createToken = (tokenRoomId) => {
    N.API.createToken(tokenRoomId, username, role, (token) => {
      console.log('Token created', token);
      res.send(token);
    }, (error) => {
      console.log('Error creating token', error);
      res.status(401).send('No Erizo Controller found');
    });
  };

  if (roomId) {
    createToken(roomId);
  } else {
    getOrCreateRoom(room, type, mediaConfiguration, createToken);
  }
});


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  res.header('Access-Control-Allow-Headers', 'origin, content-type');
  if (req.method === 'OPTIONS') {
    res.send(200);
  } else {
    next();
  }
});

cleanExampleRooms(() => {
  getOrCreateRoom(defaultRoomName, undefined, undefined, (roomId) => {
    defaultRoom = roomId;
    let port = 3001;
    let tlsPort = 3004;
    if (config.basicExample && config.basicExample.port) {
      port = config.basicExample.port;
    }
    if (config.basicExample && config.basicExample.tlsPort) {
      tlsPort = config.basicExample.tlsPort;
    }

    app.listen(port);
    const server = https.createServer(options, app);
    console.log('BasicExample started');
    server.listen(tlsPort);
    const {execSync} = require('child_process');
    var io = socketIO.listen(server);
    io.sockets.on('connection', function(socket) {

      // convenience function to log server messages on the client
      //function log() {
      //    var array = ['Message from server:'];
      //    array.push.apply(array, arguments);
      //    socket.emit('log', array);
      //}

      socket.on('message', function(message) {
        console.log('Client said: ', message);
        // for a real app, would be room-only (not broadcast)
        console.log(message);
        socket.broadcast.emit('message', message);
      });

      socket.on('disconnect', function(message) {
        console.log('Client said: ', message);
        // for a real app, would be room-only (not broadcast)
        console.log(message);
        socket.broadcast.emit('disconnection', message);
      });

      socket.on('chatmessage', function(message) {
        console.log('test said: ', message);
        // for a real app, would be room-only (not broadcast)
        let output = execSync('echo "' + message + '" | apertium en-es');
        //socket.broadcast.emit('chatmessage', output.toString());
        socket.broadcast.emit('chatmessage', message);
      });

      socket.on('create or join', function(room) {
        console.log('Received request to create or join room ' + room);

        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        console.log('Room ' + room + ' now has ' + numClients + ' client(s)');

        if (numClients === 0) {
          socket.join(room);
          console.log('Client ID ' + socket.id + ' created room ' + room);
          socket.emit('created', room, socket.id);

        } else if (numClients === 1) {
          console.log('Client ID ' + socket.id + ' joined room ' + room);
          io.sockets.in(room).emit('join', room);
          socket.join(room);
          socket.emit('joined', room, socket.id);
          io.sockets.in(room).emit('ready');
        } else { // max two clients
          socket.emit('full', room);
        }
      });

      socket.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
          ifaces[dev].forEach(function(details) {
            if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
              socket.emit('ipaddr', details.address);
            }
          });
        }
      });

      socket.on('bye', function(){
        console.log('received bye');
      });

    });

  });
});
