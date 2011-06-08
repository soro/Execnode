//  Command line client support class for execnode, used in bin/xn.
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

// Client object used when attaching to a process running on a slave.
var Client = module.exports = function ExecNodeClient(host, port, jobid) {
    if (!(this instanceof ExecNodeClient)) return new ExecNodeClient();

    var http = require('http');
    var rl = require('readline');
    var WebSocket = require('websocket-client').WebSocket;
    // Assign stdin and stdout and resume stdin, so events are emitted on
    // keypress (it is halted by default). Also set a prompt prefix and
    // initialize a variable to contain lines buffered while waiting for user input.
    var self = this;
    self.stdin = process.stdin;
    process.stdin.resume();
    self.stdout = process.stdout;
    self.halt = false;
    self.lineBuffer = '';
    
    this.complete = function (text) {
        return;
    };

    // Instantiate readline interface from node.js standard library.
    var rli = self.rli = rl.createInterface(self.stdin, self.stdout, function (text) {
        return self.complete(text);
    });
    
    this.connect = function () {
        var url = 'ws://' + host + ':' + port + '/' + jobid
        var socket = self.socket = new WebSocket(url, 'client');

        // Handle incoming messages from the server depending on their type.
        socket.onmessage = function (data) {
            message = JSON.parse(data.data);
            if (message.kind === "stderr") {
                // TODO: make stderr message appear in red
                if (self.halt === true) {
                    self.lineBuffer += message.data;
                }
                else {
                    self.stdout.write(message.data);
                }
            }
            if (message.kind === "stdout") {
                if (self.halt === true) {
                    self.lineBuffer += message.data;
                }
                else {
                    self.stdout.write(message.data);
                }
            }
            if (message.kind === "control") {
                if (message.data === "inactive") {
                    self.stdout.write('that job is inactive');
                }
                if (message.data === "SIGTERM") {
                    self.stdout.write('the process has been terminated\n');
                    process.exit(1);
                }
            }
        };

        // Whenever a key is pressed, this callback is invoked. It immediately
        // sets halt to true, thus preventing further stdout from being printed
        // and distracting the user
        //
        // The prompt is slightly broken since node 0.4.x. It takes a while to appear
        self.stdin.addListener('data', function (chunk) {
            if (!self.halt && chunk[0] !== 13) {
                self.halt = true;
            }
        });
        // This callback is invoked when enter is pressed. It first checks whether
        // the input contains a leading slash, which means it is a control command
        // and then sends the input accordingly.
        rli.addListener('line', function (line) {
            if (self.halt) {
                var kind;
                if (line.match(/^\//)) { kind = 'control'; line = line.slice(1); }
                else { kind = 'stdin'; line += '\n'; }
                self.halt = false;
                self.stdout.write(self.lineBuffer);
                self.lineBuffer = '';
                socket.send(JSON.stringify({'kind': kind, 'data': line}))
            }
        });
    };
}
