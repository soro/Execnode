var http = require('http');
var Emitter = require('events').EventEmitter;

var request = function (url, type, ctype, body, callback) {
    var cl = http.createClient(8000);
    var content = '';
    var code = 0;
    if (type == 'POST') {
        var request = cl.request('POST', url, {'Content-Type': ctype});
    }
    else {
        var request = cl.request('GET', url);
    }
    request.on('response', function (response) {
        response.setEncoding('utf-8');
        response.on('data', function (chunk) {
            content += chunk;
        });
        response.on('end', function () {
            code = response.statusCode;
            callback.call(this, {'body': content, 'code': code});
        });
    });
    if (type == 'POST') {
        if (ctype == 'application/json') {
                request.end(JSON.stringify(body));
        }
        else {
            request.end(body);
        }
    }
    else {
        request.end();
    }
}

exports.post_json = function (url, body, callback) {
    return request(url, 'POST', 'application/json', body, callback);
}

exports.post_text = function (url, body, callback) {
    return request(url, 'POST', '', body, callback);
}

exports.get = function (url, callback) {
    return request(url, 'GET', '', '', callback);
}

exports.hook_stdout = function (callback) {
    var old_write = process.stdout.write;

    process.stdout.write = (function(write) {
        return function(string, encoding, fd) {
            callback(string, encoding, fd)
        }
    })();

    return function() {
        process.stdout.write = old_write
    }
}

exports.mockSocket = function () {
    var emitter = new Emitter();
    emitter.sent = [];
    emitter.send = function (str) {
        this.sent.push(str);
    };
    return emitter;
}

exports.stubFunc = function (args) {
    this.calledWith = args;
}

exports.mockConn = function () {
    this.closed = false;
    this.message = "";
    this.close = function () { this.closed = true; };
    this.send = function (message) { this.message = message; };
}

exports.mockProc = function () {
    this.written = "";
    this.write = function (s) { this.written += s; };
}
