//  Execnode server
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var Hub = module.exports = function Hub() {
    var self = this;
    var event = require('events');
    var express = require('express');
    var server = express.createServer();
    var ws = require('websocket-server');
    var JobQueue = require('execnode').JobQueue;
    var ConMan = require('execnode').ConMan;

    // Configure express to decode the bodies of POST requests based on the MIME 
    // type and to look for static files in ../static
    server.configure(function () {
        server.use(express.bodyParser());
        server.use(express.static(__dirname + '/../static'));
    });
    // Set templating engine to jade, disable layouts and set template dir to 
    // ../views
    server.set('view engine', 'jade');
    server.set('views', __dirname + '/../views');
    server.set('view options', { layout: false });

    var queue = server.queue = new JobQueue(server);
    var conman = server.conman = new ConMan(server);

    // Submit jobs by posting to / The message should include a json object that 
    // looks like {'command': 'something', 'args': ['some', 'args']}
    server.post('/', function (req, res) {
        var job = {
            'command': req.body.command,
            'args': req.body.args
        };
        var jobid = queue.enqueue(job);
        conman.sendStatusUpdateWeb(jobid);
        res.send(String(jobid), 200);
    });

    // Get list of jobs. The list will be an object that looks like
    // {0: {'status': 'queued', 'id': 0, 
    // 'jobspec': {'command': 'ls', 'args': ['/']},
    // 'slaveinfo': {'id': 'someid', 'address': '127.0.0.1'}}}
    server.get('/joblist', function (req, res) {
        res.header('Content-Type', 'application/json');
        var joblist = queue.listJobs();
        res.send(joblist);
    });

    server.get('/', function (req, res) {
        res.render('index');
    });

    // A URL like hostname/results/1 will return the complete stdout of job 1
    server.get('/results/:id', function (req, res) {
        var jobid = req.params.id;
        var result = queue.fetchResult(jobid);
        res.send(String(result));
    });

    // URL to post results of jobs as plain text once they are finished 
    // or have failed.
    server.post('/:id', function (req, res) {
        var jobid = req.params.id;
        var result = req.body.result;
        var code = req.body.code;
        if (queue.jobExists(jobid)) {
            // Update jobs info in queue
            queue.postResult(jobid, result, code);
            if (code !== "SIGTERM") {
                conman.handleTermination(jobid, code);
            }
            res.send(200);
        }
        else { res.send(404); }
    });

    // Get one job description from server
    server.get('/pull', function (req, res) {
        var job = queue.pull();
        if (typeof(job) === "undefined") {
            res.send('{}');
        }
        else {
            res.send(job);
        }
    });
    
    server = ws.createServer({"debug": false,
                              "server": server, 
                              "subprotocol": "webclient"});

    // ### This is the section where websocket connections are handled

    // -----------------

    server.addListener('connection', function (conn) {
        // Path is used to determine which job to attach to
        var path = conn._req.url.substr(1);
        // Subprotocol is used to determine which kind of client is connecting.
        var subprotocol = conn._req['headers']['sec-websocket-protocol'];
        var clientconns = conman.clientconns;

        // #### If connecting client is a slave, register corresponding handlers
        
        if (subprotocol === "slave") {
            var jobid = path;
            conman.slaveConn[jobid] = conn;

            conn.addListener('message', function (message) {
                var message = JSON.parse(message);
                if (message.kind === "stdout" || message.kind === "stderr") {
                    // If job is attached, get the connections of all listening
                    // clients and
                    if (clientconns[jobid] !== undefined) {
                        var connids = Object.keys(clientconns[jobid]);
                        var i = connids.length;
                        var json = JSON.stringify(message);
                        // iterate over all connections, sending the message
                        while (i--) {
                            clientconns[jobid][connids[i]].send(json);
                        }
                    }
                }
                else if (message.kind === "control") {
                    if (message.data.slaveId) {
                        queue.jobs[jobid].slaveinfo = message.data;
                        queue.markActive(jobid);

                        // Start a timeout in case the process dies and doesn't
                        // cleanly sever the connection
                        conman.startTimeout(jobid);

                        conman.sendStatusUpdateWeb(jobid);
                    }
                    else if (message.data === "kalive") {
                        conman.resetTimeout(jobid);
                    }
                    else if (message.data.code === "SIGTERM") {
                        conman.handleTermination(jobid, "SIGTERM");
                    }
                }
                // This case is necessary because each new client that attaches
                // to the process needs to be sent the complete stdout produced
                // before it connected.
                else if (message.kind === "buffered") {
                    var json = JSON.stringify({'kind': 'stdout',
                                              'data': message.data});
                    clientconns[jobid][message.clientid].send(json);
                }
            });
        }

        // #### Handle case where connecting client is an end user client
        // meaning command line or attach view in webapp

        else if (subprotocol === "client") {
            var jobid = path;
            var slaveConn = conman.getSlaveConn(jobid);
            if (slaveConn !== undefined) {
                slaveConn.send(JSON.stringify({'kind': 'control',
                                               'data': 'attach',
                                               'clientid': conn.id}));
            }
            else {
                conn.send(JSON.stringify({'kind': 'control',
                                          'data': 'inactive'}));
                return;
            }

            if (clientconns[jobid] === undefined) { clientconns[jobid] = {}; }
            clientconns[jobid][conn.id] = conn;

            // If process is attached, forward message to slave. Otherwise send 
            // 'inactive' to client.
            conn.addListener('message', function (message) {
                if (slaveConn !== undefined) {
                    slaveConn.send(message);
                }
                else {
                    conn.send(JSON.stringify({'kind': 'control',
                                              'data': 'inactive'}));
                }
            });

            // If connection is closed, send corresponding detach message unless 
            // other clients are still connected
            conn.addListener('close', function (connection) {
                delete clientconns[jobid][conn.id];
                if (Object.keys(clientconns[jobid]).length === 0) {
                    if (slaveConn !== undefined) {
                        slaveConn.send(JSON.stringify({'kind': 'control',
                                                       'data': 'detach'}));
                    }
                }
            });
        }

        // #### Handle connection by webclient. 
        // List jobs on 'listall'

        else if (subprotocol === "webclient") {
            // Add this connection to the list of webclients kept in queue
            conman.webclients.push(conn);
            conn.addListener('message', function (message) {
                var message = JSON.parse(message);
                if (message.kind === "control") {
                    if (message.data === "listall") {
                        jobs = queue.listJobs();
                        conn.send(JSON.stringify(jobs));
                    }
                }
            });
            conn.addListener('timeout', function (message) { conn.close(); });
        }
    });
    
    return server;
};
