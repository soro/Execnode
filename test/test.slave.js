var http = require('http');
var Slave = require('execnode').Slave;
var hub = require('../lib/hub')();
var util = require('./testutils');

var subJob = {'command': 'echo', 'args': ['"test"']};

var succJob = { status: 'pulled', id: 0, jobspec: { command: 'echo', 
                                                    args: [ '"test"' ] }};
var failJob = { status: 'pulled', id: 0, jobspec: { command: 'cat',
                                                    args: [ '"vapor"' ] }};

var slave = new Slave('127.0.0.1', 8000);
var testinfo = {'slaveId': 'someid', 'slaveAddress': '127.0.0.1'};

var testAttachMessage = JSON.stringify({'kind': 'control',
                                        'data': 'attach',
                                        'clientid': 1});
var testDetachMessage = JSON.stringify({'kind': 'control',
                                        'data': 'detach',
                                        'clientid': 1});

exports['test fetch'] = function (test) {
    hub.listen(8000);
    util.post_json('/', subJob, function (res) {
        slave.fetch();
        setTimeout(function () {
            test.deepEqual(slave.queue[0], { status: 'pulled', id: 0,
                                             jobspec: { command: 'echo',
                                                        args: [ '"test"' ] }});
            hub.close();
            test.done();
        }, 300);
    });
};

exports['test startNext'] = function (test) {
    var calledWith = {};
    slave.start = function (id, spec) { calledWith = [id, spec]; };
    slave.startNext();
    setTimeout(function () {
        test.equal(calledWith[0], 0)
        test.deepEqual(calledWith[1], { command: 'echo', args: ['"test"']});
        test.done();
    }, 300);
};

exports['test_handle_open'] = function (test) {
    var socket = util.mockSocket();
    slave.c_sock_handle_open(0, socket)();
    test.equal(slave.handshakeCompleted[0], true);
    test.deepEqual(socket.sent[0], JSON.stringify({'kind': 'control',
                                                   'data': testinfo}));
    test.done();
}

exports['test_onmessage'] = function (test) {
    var proc = new util.mockProc();
    var socket = util.mockSocket();
    var sockonm = slave.c_sock_onmessage(proc, 0, socket);
    slave.bufferedStdout[0] = "test";
    sockonm({'data': testAttachMessage});
    test.deepEqual(socket.sent[0], JSON.stringify({'kind': 'buffered',
                                                   'data': 'test',
                                                   'clientid': 1}));
    test.done();
}

// exports['test_onstdouterr'] = function (test) {
//     var proc = new util.mockProc();
//     var socket = util.mockSocket();
//     test.done();
// }

// exports['test_exit_handler'] = function (test) {
// ensure complete cleanup
// }
