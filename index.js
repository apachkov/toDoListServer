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

app.use(express.static('./'));

/**
 * Global variables
 */

var tasksHistory = {};

var tasks = {};

/**
 * Helper function for escaping input strings
 */
function htmlEntities(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.get('/tasks', function(req, res) {
  res.json(tasksHistory[req.query.id] || []);
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
  var connection = request.accept(null, request.origin);

  var taskName = false;

  console.log((new Date()) + ' Connection accepted.');

  // user sent some message
  connection.on('message', function(message) {
    if (message.type === 'utf8') { // accept only text
      var msgParsed;

      try {
        msgParsed = JSON.parse(message.utf8Data);
      } catch (err) {
        console.log(err);
        return;
      }
      
      if (msgParsed.type == 'connect') {
        taskName = msgParsed.name;

        if (!tasksHistory[taskName]) {
          tasks[taskName] = [];
        }
        if (!tasksHistory[taskName]) {
          tasksHistory[taskName] = {};
        }

        tasks[taskName].push(connection)
      } else if (msgParsed.type == 'upsert') {
        if (!tasksHistory[taskName][msgParsed.taskId]) {
          msgParsed.title = htmlEntities(msgParsed.title);
          msgParsed.description = htmlEntities(msgParsed.description);

          tasksHistory[taskName][msgParsed.taskId] = msgParsed;
        } else {
          tasksHistory[taskName][msgParsed.taskId].status = msgParsed.status;
        }

        sendAll(msgParsed);
      } else if (msgParsed.type == 'delete') {
        delete tasksHistory[taskName][msgParsed.taskId];

        sendAll(msgParsed);
      }
    }
  });

  function sendAll(message) {
    var json = JSON.stringify(message);

    for (var i = 0; i < tasks[taskName].length; i++) {
      if (tasks[taskName][i] !== connection) {
        tasks[taskName][i].sendUTF(json);
      }
    }
  }

  connection.on('close', function() {
    if (taskName !== false) {
      console.log((new Date()) + "User with taskName '"
        + taskName + "' disconnected.");

      var index = tasks[taskName].indexOf(connection);
      tasks[taskName].splice(index, 1);
    }
  });

});
