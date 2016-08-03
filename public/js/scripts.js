$(document).ready(function() {
    var
      ws = new WebSocket('ws://ec2-54-191-226-244.us-west-2.compute.amazonaws.com:3500/'),
      getUrl = 'http://ec2-54-191-226-244.us-west-2.compute.amazonaws.com:3500/tasks?id=',
      $toDoBlock = $('.on-hach-show'),
      $start = $('.start'),
      $name = $('.name'),
      $titleField = $('#title'),
      $descriptionField = $('#description'),
      $toDoColumn = $('#todo'),
      $inProgressColumn = $('#inprogress'),
      $doneColumn = $('#done'),
      $intro = $('.bs'),
      $body = $('body'),
      tasks = {};

    function wsConnect(boardName, idErr){
        boardName = boardName.replace('#', '');
        $intro.hide();
        $name.html(boardName);
        var connect = {type: 'connect', id: idErr, name: boardName};

        ws.onopen = function (event) {
            ws.send(JSON.stringify(connect));
        };

        getQuery(boardName);
    }

    function getQuery(idTask){
        var query = new XMLHttpRequest();

        query.open('GET', getUrl+idTask, true);

        query.onreadystatechange = function () {
            if (this.readyState === this.DONE) {
                if (this.responseText.length > 2){
                    tasks = JSON.parse(this.responseText);
                }
                if (this.status !== 403) {
                    redrawBoard();
                }
            }
        };

        query.send();
    }

    function handleMessage(message){
        if (message.type === 'upsert'){
            tasks[message.taskId] = message;
        }

        if  (message.type === 'delete'){
            delete tasks[message.taskId];
        }

        redrawBoard();
    }

    if (!window.location.hash){
        $toDoBlock.hide();
    }else {
        var hashLoad = window.location.hash;

        wsConnect(hashLoad, 'errOnLoad');
        $toDoBlock.show();
    }

    $start.bind('click', function () {
        $toDoBlock.show();
        $intro.hide();
        var hash = Math.random()*9999;
        var titleHash = (hash.toString(36)).substring(0, 5);
        window.location.hash = titleHash;
        $name.html(titleHash);
        var connect = {type: 'connect', id: 'errOnClickStart', name: titleHash};
        ws.send(JSON.stringify(connect));
        getQuery(titleHash);
        return false;
    });

    function redrawBoard(){
        var board = {
            todo: [],
            inprogress: [],
            done: []
        };

        $.each(tasks, function (taskId, task) {
            task.taskId = taskId;
            board[task.status].push(task);
        });
        $toDoColumn.html('');
        $inProgressColumn.html('');
        $doneColumn.html('');
        if (board.todo.length > 0){
            board.todo.forEach(function(val){
                $toDoColumn.append('<div class="item" data-task="'+ val.taskId +'"><div class="close"><a class="btn btn-danger btn-delete" href="#" role="button"><span class="glyphicon glyphicon-remove"></span></a></div><h3>'+ val.title +'</h3><p>'+ val.description +'</p><p> <a class="btn btn-primary btn-inprogress" href="#" role="button">Начать делать »</a></p></div>');
            });
        }
        if (board.inprogress.length > 0){
            board.inprogress.forEach(function(val){
                $inProgressColumn.append('<div class="item" data-task="'+ val.taskId +'"><div class="close"><a class="btn btn-danger btn-delete" href="#" role="button"><span class="glyphicon glyphicon-remove"></span></a></div><h3>'+ val.title +'</h3><p>'+ val.description +'</p><p> <a class="btn btn-success btn-done" href="#" role="button">Завершить »</a></p></div>');
            });
        }
        if (board.done.length > 0){
            board.done.forEach(function(val){
                $doneColumn.append('<div class="item" data-task="'+ val.taskId +'"><div class="close"><a class="btn btn-danger btn-delete" href="#" role="button"><span class="glyphicon glyphicon-remove"></span></a></div><h3>'+ val.title +'</h3><p>'+ val.description +'</p></div>');
            });
        }
    }

    ws.onmessage = function (event) {
        var message = JSON.parse(event.data);
        handleMessage(message);
    };

    $body.on('click', '.btn-add-task', function () {
        if($titleField.val() && $descriptionField.val()) {
            var taskId = Math.random() * 9999;
            taskId = (taskId.toString(36)).substring(0, 6);
            var newTask = {type: 'upsert'};
            newTask.id = 'creatingTask';
            newTask.taskId = taskId;
            newTask.title = $titleField.val();
            newTask.description = $descriptionField.val();
            newTask.status = 'todo';
            ws.send(JSON.stringify(newTask));
            handleMessage(newTask);
            $descriptionField.val('');
            $titleField.val('').focus();
        }else {
            alert('Пожалуйста, заполните все поля.');
        }
        return false;
    });

    $body.on('click', '.btn-inprogress', function () {
        var task = $(this).parents('.item').data('task');
        tasks[task].status = 'inprogress';
        var taskUpd = tasks[task];
        taskUpd.type = 'upsert';
        taskUpd.id = 'inprogressBtn';
        ws.send(JSON.stringify(taskUpd));
        handleMessage(taskUpd);
        return false;
    });

    $body.on('click', '.btn-done', function () {
        var task = $(this).parents('.item').data('task');
        tasks[task].status = 'done';
        var taskUpd = tasks[task];
        taskUpd.type = 'upsert';
        taskUpd.id = 'doneBtn';
        ws.send(JSON.stringify(taskUpd));
        handleMessage(taskUpd);
        return false;
    });

    $body.on('click', '.btn-delete', function () {
        var task = $(this).parents('.item').data('task');
        var taskRem = {type: 'delete', id: 'closeTask', taskId: task};
        ws.send(JSON.stringify(taskRem));
        handleMessage(taskRem);
        return false;
    });

});