var filter = '';

// For each key call function with key and value
var enumerate = function (obj, func) {
    var keys, i = (keys = Object.keys(obj)).length;
    while (i--) {
        func(keys[i], obj[keys[i]]);
    }
}

var updateStore = function (jobs) {
    enumerate(jobs, function (id, job) {
        sessionStorage[id] = job;
    });
}

var formatJob = function (job) {
    var html = '<td class="kill">kill job</td>'
    enumerate(job, function (key, val) { html += '<td>' + val + '</td>' });
    return html;
}

// TODO: This needs to take into account the currently set filter
var updateList = function (jobs) {
    console.log(jobs);
    var list = $('#joblist')[0];
    var newlist = document.createDocumentFragment();
    enumerate(jobs, function (id, job) {
        var elem = $('#jobid-' + id);
        if (elem.length > 0) {
            elem.html(formatJob(job));
        }
        else {
            var node = document.createElement('tr');
            node.id = 'jobid-' + id;
            var html = formatJob(job);
            var jnode = $(node);
            jnode.html(html);
            newlist.appendChild(jnode[0]);
        }
    });
    list.appendChild(newlist);
}

var submitJob = function (jobspec) {
    $.ajax({
        url: '/',
        type: 'POST',
        data: jobspec,
        dataType: 'text',
        success: function (res) {
            alert('successfully posted job with id' + res);
        },
        error: function (xhr, status) {
            alert('request failed');
        }
    });
}

$(document).ready(function () {
    var socket = new WebSocket('ws://127.0.0.1:5000/', 'webclient');
    socket.onopen = function () {
        socket.send(JSON.stringify({'kind': 'control', 'data': 'listall'}));
    };
    socket.onmessage = function (message) {
        var joblist = JSON.parse(message.data);
        updateStore(joblist);
        updateList(joblist);
    };
//     submitJob({'command': 'ls', 'args': []});
});
