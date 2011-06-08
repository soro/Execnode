//  Execnode slave
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var Slave = module.exports = function Slave(hub_url, hub_port) {
    if (!(this instanceof Slave)) return new Slave();
    var self = this;

    var event = require('events');
    var http = require('http');
    var subp = require('child_process');
    var WebSocket = require('websocket-client').WebSocket;
    // Should create connection here and send keep-alive
    //     var hubClient = http.createClient(5000, server_url);
    // TODO: set correct info from config file
    self.info = {'slaveId': 'someid', 'slaveAddress': '127.0.0.1'};
    self.attached = {};
    // Queue of jobs that have been pulled from the hub
    self.queue = [];
    // Count of active jobs
    self.activecount = 0;
    // Timers
    self.timers = {};
    // As long as no client is attached, stdout is buffered. Also sent when new 
    // clients attach
    self.bufferedStdout = {};
    // An entry of jobid: True is generated once websocket is open.
    self.handshakeCompleted = {};
    self.sockets = {};

    this.openWebSocket = function (url) {
        return new WebSocket(url, 'slave');
    };
    this.getHttpConn = function () {
        return http.createClient(hub_port, hub_url);
    };

    // Fetch job from the hub via http request and push it into self.queue
    this.fetch = function () {
        var hubClient = self.getHttpConn();
        var request = hubClient.request('GET', '/pull');
        request.end();
        request.on('response', function (response) {
            response.setEncoding('utf-8');
            var body = '';
            response.on('data', function (chunk) {
                body += chunk;
            });
            response.on('end', function () {
                if (body != '{}') {
                    self.queue.push(JSON.parse(body));
                }
            });
        });
    };

    // Start next job. Will retry until there is a job in self.queue
    this.startNext = function () {
        var job;
        var intId = setInterval(function () {
            job = self.queue.pop();
            if (job) {
                self.start(job.id, job.jobspec);
                clearInterval(intId);
            }
        }, 100);
    };

    // Using closures to build callback handlers makes the code far easier to 
    // test.

    // Returns 'open' event handler.
    this.c_sock_handle_open = function (jobid, socket) {
        var sock_handle_open = function () {
            socket.send(JSON.stringify({'kind': 'control', 'data': self.info}));
            self.handshakeCompleted[jobid] = true;
            var ka_message = JSON.stringify({'kind': 'control', 'data': "kalive"});
            var timerid = setInterval(function () {
                socket.send(ka_message);
            }, 5000);
            self.timers[jobid] = timerid;
        };
        return sock_handle_open;
    };

    // Returns handler that reacts to messages sent by the hub.
    this.c_sock_onmessage = function (jp, jobid, socket) {
        var sock_onmessage = function (data) {
            var message = JSON.parse(data.data);
            if (message.kind === "control") {
                if (message.data === "attach") {
                    self.attached[jobid] = true;
                    socket.send(JSON.stringify({'kind': 'buffered', 
                                                'data': self.bufferedStdout[jobid],
                                                'clientid': message.clientid}));
                }
                else if (message.data === "detach") {
                    self.attached[jobid] = false;
                }
                else if (message.data === "term") {
                    console.log('received kill message for job ' + jobid);
                    jp.kill();
                }
            }
            else if (message.kind === "stdin") {
                jp.stdin.write(message.data);
            }
        };
        return sock_onmessage;
    };

    // Returns handler that handles stdout and stderr events and sends data
    // to hub.
    this.c_proc_on_stdouterr = function (jobid, kind, socket) {
        var proc_on_stdout = function (data) {
            var data = data.toString('utf-8');
            if (self.attached[jobid]) {
                socket.send(JSON.stringify({'kind': kind, 'data': data}));
            }
            // TODO: mark stderr via terminal colour in buffer
            self.bufferedStdout[jobid] += data;
        };
        return proc_on_stdout;
    };

    // Returns handler that deals with subprocess 'exit' event
    this.c_proc_on_exit = function (jobid) {
        var proc_on_exit = function (code, signal) {
            setInterval(function () {
                // This is necessary because if the handshake has not completed 
                // before // the POST request is made, there is no connection to
                // cleanly close on the server side. Also node-websocket-server 
                // can't handle close messages from the client, might have to 
                // implement that myself.
                if (self.handshakeCompleted) {
                    clearInterval(this);
                    // console.log('proc_on_exit'+ code + signal);
                    self.cleanup(jobid, code, signal);
                }
            }, 500);
        };
        return proc_on_exit;
    };

    // Start a job
    this.start = function (jobid, jobspec) {
        self.activecount +=1;
        console.log('Spawning command \"' + jobspec.command + '\" with args: ' +
                    jobspec.args);
        var jp = subp.spawn(jobspec.command, jobspec.args);
        var url = 'ws://localhost' + ":" + hub_port + "/" + jobid;
        var socket = self.sockets[jobid] = self.openWebSocket(url); 
        self.handshakeCompleted[jobid] = false;
        self.bufferedStdout[jobid] = "";

        // Once the websocket has been set up send identification, telling the 
        // hub that the job has been started
        socket.on('open', self.c_sock_handle_open(jobid, socket));

        // Set up handler for incoming messages from the hub, either control or 
        // stdin
        socket.onmessage = self.c_sock_onmessage(jp, jobid, socket);

        // If the subprocess emits stdout, send it to server if attached is true 
        // or buffer it
        jp.stdout.on('data', self.c_proc_on_stdouterr(jobid, 'stdout', socket));

        // Do the same for stderr
        jp.stderr.on('data', self.c_proc_on_stdouterr(jobid, 'stderr', socket));

        // Handle the exit of the subprocess, be it premature or planned
        jp.on('exit', self.c_proc_on_exit(jobid));
    };

    // Clean up after a job is terminated for whatever reason
    this.cleanup = function (jobid, code, signal) {
        var hubClient = self.getHttpConn();
        var request = hubClient.request('POST', '/' + jobid, 
                                        {'Content-Type': 'application/json'});
        var rcode;
        if (code === 0) { rcode = code; }
        else { rcode = code || signal; }
        request.end(JSON.stringify({'code': rcode, 
                                    'result': self.bufferedStdout[jobid]}));
        var sock = self.sockets[jobid];
        // This tells the server to stop the timout timer and send termination
        // messages to all clients - also causes server to close websocket
        sock.send(JSON.stringify({'kind': 'control', 'data': {'code': rcode}}));
        self.activecount -= 1;
        delete self.attached[jobid];
        delete self.bufferedStdout[jobid];
        delete self.handshakeCompleted[jobid];
        delete self.sockets[jobid];
        clearInterval(self.timers[jobid]);
        delete self.timers[jobid];
    };

    // Clean up in case of SIGINT
    this.handle_sigint = function () {
        // TODO: make sure handshake has completed
        var sendClose = function (jobid) { 
            var sock = self.sockets[jobid];
            sock.send(JSON.stringify({'kind': 'control',
                                      'data': 'terminated',
                                      'buffered': self.bufferedStdout[jobid]}));
        };
        var socketkeys, len = (socketkeys = Object.keys(self.sockets)).length;
        while (len--) {
            var jobid = socketkeys[len];
            sendClose(jobid);
        }
        process.exit();
    };
};
