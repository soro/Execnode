var http = require('http');
var hub = require('../lib/hub')();
var util = require('./testutils');
var WebSocket = require('websocket-client').WebSocket;

hub.listen(8000);

var testJob = {'command': 'echo', 'args': ['"test"']};
var testResult = {'code': 0, 'result': 'result0'};
var testResult2 = {'code': 0, 'result': 'result5'};
var testStdin = JSON.stringify({'kind': 'stdin', 'data': 'test'});
var deadStub = function (args) {};
var queue = hub.server.queue;
var conman = hub.server.conman;

exports["test correct queue init"] = function (test) {
    test.equal(queue.hub, hub.server);
    test.done();
}

exports["test submission of jobs"] = function (test) {
    util.post_json('/', testJob, function (res) {
        test.equal(res.code, 200);
        test.deepEqual(queue.jobs[0], { status: 'queued', id: 0, 
                                        jobspec: testJob });
        test.done();
    });
}

exports["test pulling of jobs"] = function (test) {
    util.get('/pull', function (res) {
        test.deepEqual(JSON.parse(res.body), { status: 'pulled', id: 0, 
                                               jobspec: testJob});
        test.done();
    });
}

// TODO: add negative test case here
exports["test posting of results"] = function (test) {
    conman.slaveConn[0] = new util.mockConn();
    util.post_json('/0', testResult, function (res) {
        test.equal(res.code, 200);
        test.equal(queue.getStatus(0), 0);
        test.equal(queue.completed[0], "result0");
        test.done();
    });
}

exports["test fetching of results"] = function (test) {
    util.get('/results/0', function (res) {
        test.deepEqual(res.body, "result0");
        test.done();
    });
}

exports["test failed submit with nonexistant id"] = function (test) {
    util.post_json('/5', testResult2, function (res) {
        test.equal(res.code, 404);
        test.done();
    });
}

// TODO: test needs to be replaced by test of conman functionality
// exports["test closing of connections upon result post"] = function (test) {
//     util.post_json('/', testJob, function (res) {
//         var jobid = res.body;
//         // this cant work anymore...
//         conman.cleanupConns = deadStub;
//         conman.slaveConn[jobid] = new util.mockConn();
//         conman.clientconns[jobid] = {'123': new util.mockConn(), '345': new util.mockConn()};
//         util.post_json('/' + jobid, testResult2, function (res) {
//             test.equal(conman.slaveConn[jobid].closed, true);
//             for (var key in conman.clientconns[jobid]) {
//                 if (conman.clientconns[jobid].hasOwnProperty(key)) {
//                     conn = conman.clientconns[jobid][key];
//                     test.equal(conn.closed, true);
//                     test.deepEqual(JSON.parse(conn.message), 
//                                    {'kind': 'control', 'data': 'completed'});
//                 }
//             }
//             test.done();
//         });
//     });
// }

exports["test client connection"] = function (test) {
    util.post_json('/', testJob, function (res) {
        var jobid = res.body;
        var url = 'ws://localhost:8000/' + jobid;
        var client = new WebSocket(url, 'client'); 
        var slConn = conman.slaveConn[jobid] = new util.mockConn();
        client.on('open', function () {
            client.send(testStdin);
        });
        setTimeout(function () {
            test.equal(slConn.message, testStdin);
            test.done();
        }, 700);
    });
}

exports["test slave connection"] = function (test) {
    util.post_json('/', testJob, function (res) {
        var jobid = res.body;
        var testOut = JSON.stringify({'kind': 'stdout', 'data': 'testout'});
        var url = 'ws://localhost:8000/' + jobid;
        var slave = new WebSocket(url, 'slave'); 
        var clConn = (conman.clientconns[jobid] = {})['123'] = new util.mockConn();
        slave.on('open', function () {
            slave.send(JSON.stringify({'kind': 'control', 'data': {'slaveId': jobid}}));
            slave.send(testOut);
        });
        setTimeout(function () {
            test.equal(clConn.message, testOut);
            test.equal(queue.getStatus(jobid), "active");
            test.done();
        }, 700);
    });
}
