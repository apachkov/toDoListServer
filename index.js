"use strict";

var express = require('express');
var app = express();

app.use(express.bodyParser());

var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-XSRF-TOKEN');
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

var
  tasksHistory = {},
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
  if (tasksHistory[req.query.id]) {
    allDownloadsCounter++;
  }

  res.json(tasksHistory[req.query.id] || []);
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
  console.log((new Date()) + ' Connection from origin ' + request.origin + '.');

  // accept connection - you should check 'request.origin' to make sure that
  // client is connecting from your website
  // (http://en.wikipedia.org/wiki/Same_origin_policy)
  var
    connection = request.accept(null, request.origin),
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
        }

        thisBoard = tasksHistory[taskName];

        tasksConnections[taskName].push(connection);
        return;
      }

      if (!thisBoard) {
        sendError(msgParsed, 'Unknown user');
        return
      }

      if (msgParsed.type == 'upsert') {
        if (!msgParsed.title || !msgParsed.description || !msgParsed.taskId || !msgParsed.status) {
          sendError(msgParsed, 'Missing required fields');
          return;
        }

        if (!tasksHistory[taskName][msgParsed.taskId]) {

          tasksHistory[taskName][msgParsed.taskId] = {
            title: htmlEntities(msgParsed.title),
            description: htmlEntities(msgParsed.description),
            status: msgParsed.status
          };

        } else {
          tasksHistory[taskName][msgParsed.taskId].status = msgParsed.status;
        }

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
