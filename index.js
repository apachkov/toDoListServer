"use strict";

var express = require('express');
var app = express();
var jsonfile = require('jsonfile');

var profilesPath = './tmp/users.json';
var usersDataFile = './tmp/data.json';

app.use(express.bodyParser());

var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header("Access-Control-Allow-Credentials", "true");
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,OPTIONS,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization');
  next();
};

app.use(allowCrossDomain);

// Port where we'll run the websocket server
var webSocketsServerPort = 3500;

// websocket and http servers
var webSocketServer = require('websocket').server;

app.use(express.static('./public'));

/**
 * Global variables
 */

var userProfiles, tasksHistory;


try {
  tasksHistory = jsonfile.readFileSync(usersDataFile);
} catch(e) {
  tasksHistory = {};
}

function saveUsersData() {
  jsonfile.writeFile(usersDataFile, tasksHistory, { spaces: 2 }, function (err) {
    if (err) console.error('Error in tasksHistory saving:', err);
  });
}

try {
  userProfiles = jsonfile.readFileSync(profilesPath);
} catch(e) {
  userProfiles = [];
}

function getUserByEmail(email) {
  return userProfiles.filter(function(user) {
    return user.email === email;
  })[0];
}

function getUserByToken(token) {
  return userProfiles.filter(function(user) {
    return user.token === token;
  })[0];
}

app.post('/login', function(req, res) {
  if (!req.body.login || !req.body.password) {
    return res.status(400).end('Wrong email or password');
  }

  var userProfile = getUserByEmail(email);

  if (!userProfile) {
    userProfile = {
      email: req.body.login,
      password: req.body.password,
      token: (Math.random()*9999999999999).toString(36).substring(0, 8),              // create new token
      tokenExpire: Date.now() + 24 * 60 * 60 * 1000,                                  // token will be expired in this date
      avatar: '',
      name: '',
      dashboard: (Math.random()*999999999).toString(36).substring(0, 5)               // create user dashboard
    };

    tasksHistory[userProfile.dashboard] = {};
    saveUsersData();

    userProfiles.push(userProfile);
    saveUserProfiles();
  } else if (userProfile.password !== req.body.password) {
    return res.status(400).end('Wrong credentials');
  } else if (userProfile.tokenExpire < Date.now()) {
    userProfile.token = (Math.random()*9999999999999).toString(36).substring(0, 8);   // update token
    userProfile.tokenExpire=  Date.now() + 24 * 60 * 60 * 1000;                       // token will be expired in this date

    saveUserProfiles();
  }

  res.json({
    token: userProfile.token,
    dashboard: userProfile.dashboard
  });
});

app.get('/profile', function(req, res) {
  var token = req.headers.authorization || '';

  token = token.replace('Bearer ', '');

  if (!token) {
    return res.status(403).end();
  }

  var userProfile = userProfiles.filter(function(user) {
    return user.token === token;
  })[0];

  if (!userProfile) {
    return res.status(404).end();
  } else if (userProfile.tokenExpire < Date.now()) {
    return res.status(401).end();
  }

  res.json({
    avatar: userProfile.avatar,
    name: userProfile.name,
    email: userProfile.email
  });
});

app.put('/profile', function(req, res) {
  var token = req.headers.authorization || '';

  token = token.replace('Bearer ', '');

  if (!token) {
    return res.status(403).end();
  }

  var userProfile = getUserByToken(token);

  if (!userProfile) {
    return res.status(404).end();
  } else if (userProfile.tokenExpire < Date.now()) {
    return res.status(401).end();
  }

  if ('email' in req.body && req.body.email) {
    var isUserExists = getUserByEmail(req.body.email);

    if (isUserExists && isUserExists !== userProfile) {
      return res.status(400).end('This email already exists, choose another one!');
    }

    userProfile.email = req.body.email;
  }

  if ('avatar' in req.body) {
    userProfile.avatar = req.body.avatar || '';
  }

  if ('name' in req.body) {
    userProfile.name = req.body.name || '';
  }

  saveUserProfiles();

  res.json({
    avatar: userProfile.avatar,
    name: userProfile.name,
    email: userProfile.email
  });
});

function saveUserProfiles() {
  jsonfile.writeFile(profilesPath, userProfiles, { spaces: 2 }, function (err) {
    if (err) console.error('Error in userProfiles saving:', err);
  });
}

var
  tasksConnections = {},
  errorCounter = 0,
  aliveCounter = 0,
  allConnectionsCounter = 0,
  allDownloadsCounter = 0;

/**
 * Helper function for escaping input strings
 */
function htmlEntities(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.get('/tasks', function(req, res) {
  var token = req.headers.authorization || '';

  token = token.replace('Bearer ', '');

  var userProfile = getUserByToken(token) || {};
  var dashboard = tasksHistory[userProfile.dashboard] || tasksHistory[req.query.id];

  if (dashboard) {
    allDownloadsCounter++;
  } else if (!token) {
    return res.status(403).end();
  }

  res.json(dashboard || {});
});

app.get('/tasks/all', function(req, res) {
  res.json(tasksHistory || {});
});

app.get('/tasks/stat', function(req, res) {
  res.json({
    errorsCount: errorCounter,
    nowAlive: aliveCounter,
    allConnections: allConnectionsCounter,
    allTaskDownloads: allDownloadsCounter
  });
});

var server = app.listen(webSocketsServerPort, function() {
  console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

/**
 * WebSocket server
 */
var wsServer = new webSocketServer({
  // WebSocket server is tied to a HTTP server. WebSocket request is just
  // an enhanced HTTP request. For more info http://tools.ietf.org/html/rfc6455#page-6
  httpServer: server
});

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function(request) {
  var token = request.httpRequest.headers['sec-websocket-protocol'] || '';

  console.log((new Date()) + ' Connection from origin ' + request.origin + '.');

  // accept connection - you should check 'request.origin' to make sure that
  // client is connecting from your website
  // (http://en.wikipedia.org/wiki/Same_origin_policy)
  var
    connection = request.accept(token.toLowerCase(), request.origin),
    taskName = false,
    thisBoard = null;

  console.log((new Date()) + ' Connection accepted.');

  aliveCounter++;
  allConnectionsCounter++;

  // user sent some message
  connection.on('message', function(message) {
    if (message.type === 'utf8') { // accept only text
      var msgParsed;

      try {
        msgParsed = JSON.parse(message.utf8Data);
      } catch (err) {
        console.log(err);
        sendError({id: 'jsonError'}, 'Can not parse JSON!');
        return;
      }

      if (msgParsed.type == 'connect') {
        if (!msgParsed.name) {
          sendError(msgParsed, 'Missing name for connection.');
          return;
        }

        taskName = decodeURIComponent(msgParsed.name);

        if (!tasksConnections[taskName]) {
          tasksConnections[taskName] = [];
        }

        if (!tasksHistory[taskName]) {
          tasksHistory[taskName] = {};
          saveUsersData();
        }

        thisBoard = tasksHistory[taskName];

        tasksConnections[taskName].push(connection);
        return;
      }

      if (!thisBoard) {
        sendError(msgParsed, 'Unknown user');
        return;
      }

      if (msgParsed.type == 'upsert') {
        if (!msgParsed.title || !msgParsed.description || !msgParsed.taskId || !msgParsed.status) {
          sendError(msgParsed, 'Missing required fields');
          return;
        }

        tasksHistory[taskName][msgParsed.taskId] = {
          title: htmlEntities(msgParsed.title),
          description: htmlEntities(msgParsed.description),
          status: msgParsed.status
        };

        sendAll(msgParsed);
      } else if (msgParsed.type == 'delete') {
        if (!msgParsed.taskId) {
          sendError(msgParsed, 'Missing taskId for deleting task.');
          return;
        }

        delete tasksHistory[taskName][msgParsed.taskId];

        sendAll(msgParsed);
      } else {
        sendError(msgParsed, 'Unknown type.');
      }

      saveUsersData();
    }
  });

  function sendAll(message) {
    var json = JSON.stringify(message);

    for (var i = 0; i < tasksConnections[taskName].length; i++) {
      if (tasksConnections[taskName][i] !== connection) {
        tasksConnections[taskName][i].sendUTF(json);
      }
    }
  }

  function sendError(message, errorText) {
    errorCounter++;

    var error = {
      id: message.id || errorCounter,
      type: 'error',
      reason: errorText
    };

    error = JSON.stringify(error);
    connection.sendUTF(error);
  }

  connection.on('close', function() {
    aliveCounter--;

    if (taskName !== false) {
      console.log((new Date()) + "User with taskName '"
        + taskName + "' disconnected.");

      var index = tasksConnections[taskName].indexOf(connection);
      tasksConnections[taskName].splice(index, 1);
    }
  });
});
