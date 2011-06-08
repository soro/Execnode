var http = require('http');
var ConMan = require('execnode').ConMan;
var JobQueue = require('execnode').JobQueue;
var util = require('./testutils');

// job as it comes in from the client
var subJob = {'command': 'echo', 'args': ['"test"']};

// slave info as sent by the slave
var slaveInfo = {'slaveId': 'someid', 'slaveAddress': '127.0.0.1'};

var succJob = { status: 'pulled', 
                id: 0, 
                jobspec: { command: 'echo', 
                           args: [ '"test"' ] }
                };
var failJob = { status: 'pulled',
                id: 0,
                jobspec: { command: 'cat',
                           args: [ '"vapor"' ] }
                };


var hub = {}
var jobQueue = JobQueue(hub);
jobQueue.jobs[0] = succJob;
hub.queue = jobQueue;

var conman = new ConMan(hub);
conman.clientconns[0] = { 0: new util.mockConn() };
conman.slaveConn[0] = new util.mockConn();

exports['start timer'] = function (test) {
    conman.startTimeout(0);
    test.ok(conman.timers[0], "timer should have been set");
    test.done();
}

exports['stop timer'] = function (test) {
    conman.startTimeout(0);
    conman.stopTimeout(0);
    test.ok(conman.timers[0] === undefined, "timer should have been cleared");
    test.done();
}

exports['reset timer'] = function (test) {
    conman.startTimeout(0);
    var old = conman.timers[0];
    test.equal(old, conman.timers[0]);
    conman.resetTimeout(0);
    test.notEqual(old, conman.timers[0]);
    test.done();
}

exports['test handleTermination'] = function (test) {
    // mock out sendStatus*
    conman.handleTermination(0, "completed");
    // check that they've been called
    test.done();
}

// should also include web test
exports['test timedout'] = function (test) {
    conman.startTimeout(0);
    var unhook = util.hook_stdout(function (str, enc, fd) {});
    conman.timedout(0);
    unhook();

    test.ok(conman.timers[0] === undefined, "timer should have been cleared");
    test.ok(conman.clientconns[0] === undefined, "client connections should" +
                                                 "have been deleted");
    test.ok(conman.slaveConn[0] === undefined, "slave connection should" +
                                               "have been deleted");
    test.done();
}
