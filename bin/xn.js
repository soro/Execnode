#!/usr/bin/env node

//  Command line client for execnode
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var opts = require('opts');
var http = require('http');
var Client = require('execnode').Client;
var conf = require('../conf/clientconf');

var list;

var options = [
    {
        short: 's',
        long: 'submit',
        description: 'submit job to server',
        value: true
    },
    {
        short: 'a',
        long: 'attach',
        description: 'attach to stdout of job with given id',
        value: true
    },
    {
        short: 'f',
        long: 'fetch',
        description: 'fetch results for supplied job id',
        value: true
    },
    {
        short: 'l',
        long: 'list',
        description: 'list jobs',
        value: false
    },
    {
        short: 'h',
        long: 'host',
        description: 'set host to connect to',
        value: true
    },
    {
        short: 'p',
        long: 'port',
        description: 'set port to connect to',
        value: true
    }
];

var arguments = [ { name: 'args' } ];

opts.parse(options, arguments, true);

// Extract arguments corresponding to command line options
var host = opts.get('h') || conf.default_address,
    port = opts.get('p') || conf.default_port,
    submit = opts.get('submit') || undefined,
    attach = opts.get('attach') || undefined,
    fetch = opts.get('fetch') || undefined,
    list = opts.get('list') || undefined,
    listfilter = opts.get('list-with-filter') || undefined;

// Dispatch GET request and call callback with its result
var getRequest = function(path, callback) {
    var hubClient = http.createClient(port, host);
    var request = hubClient.request('GET', path);
    request.end();
    request.on('response', function (response) {
        var body = '';
        response.setEncoding('utf-8');
        response.on('data', function (chunk) {
            body += chunk;
        });
        response.on('end', function () {
            if (body != '{}') {
                callback(body);
            }
        });
    });
}

// Utility functions for printing job list
var fillChar = function (times, chr) {
    times += 4;
    var retstring = '';
    while (times--) {
        retstring += chr;
    }
    return retstring;
}
var spaces = function (times) {
    return fillChar(times, ' ');
}

// Visitor functions used in PrintUtil
var PrintVisitor = function (maxLens) {
    if (!(this instanceof PrintVisitor)) return new PrintVisitor(maxLens);
    var self = this;
    this.maxLens = maxLens;
    this.pstr = '';

    this.visit = function (obj, key) {
        self.pstr += obj[key] + 
                     spaces(self.maxLens[key] - obj[key].toString().length);
    }

    // Return accumulated string and reset for next line
    this.getString = function () {
        var ret = self.pstr;
        self.pstr = '';
        return ret;
    }
}

var MaxLenVisitor = function () {
    if (!(this instanceof MaxLenVisitor)) return new MaxLenVisitor();
    var self = this;
    this.maxLens = {
        'id': 4,
        'command': 8,
        'args': 10,
        'status': 8,
        'slaveId': 8,
        'slaveAddress': 14
    };

    this.visit = function (obj, key) {
        var len = obj[key].toString().length;
        if (self.maxLens[key] < len) {
            self.maxLens[key] = len;
        }
    }
    // Sum the maximum lengths to get the toal length required to draw the 
    // separator below the headline. 20 added to account for empty chars added
    // in spaces function.
    this.getMaxLenSum = function () {
        var sum = 20;
        for (key in self.maxLens) {
            sum += parseInt(self.maxLens[key]);
        }
        return sum;
    }
}

// Use something akin to the visitor pattern to print the job list
var PrintUtil = function () {
    if (!(this instanceof PrintUtil)) return new PrintUtil();

    var self = this;
    this.visitor;

    this.setVisitor = function (visitor) {
        this.visitor = visitor;
    }
    this.acceptHelper = function (key, obj) {
        if (key === 'jobspec') {
            self.acceptHelper('command', obj.jobspec);
            self.acceptHelper('args', obj.jobspec);
            return self;
        }
        else if (key === 'slaveinfo') {
            self.acceptHelper('slaveId', obj.slaveinfo);
            self.acceptHelper('slaveAddress', obj.slaveinfo);
            return self;
        }
        else if (key !== 'jobspec') {
            self.visitor.visit(obj, key);
            return self;
        }
    }
    this.accept = function (obj) {
        self.acceptHelper('id', obj).acceptHelper('jobspec', obj).
            acceptHelper('status', obj).acceptHelper('slaveinfo', obj);
    }
}

var printJobList = function (joblist) {
    // Headline to add to array of jobs that will be printed below
    var header = { 'id': "ID", 
                   'jobspec': {'command': "Command", 'args': "Arguments"},
                   'status': "Status",
                   'slaveinfo': {'slaveId': 'Slave ID', 'slaveAddress': 'Slave Address'}
                 };
    var printUtil = new PrintUtil();
    var mlVisitor = new MaxLenVisitor();
    // Use visitor to calculate the maximum field length
    printUtil.setVisitor(mlVisitor);
    for (jobid in joblist) {
        if (joblist.hasOwnProperty(jobid)) {
            var job = joblist[jobid];
            printUtil.accept(job);
        }
    }
    var jobarr = [header];
    for (jobid in joblist) {
        jobarr.push(joblist[jobid]);
    }
    // Set visitor to print visitor
    var pVisitor = new PrintVisitor(mlVisitor.maxLens);
    printUtil.setVisitor(pVisitor);
    // Print a line for each job and if the index is 1, draw separator
    jobarr.forEach(function (job, ind, arr) {
        if (ind === 1) { console.log(fillChar(mlVisitor.getMaxLenSum(), '=')); }
        printUtil.accept(job);
        console.log(pVisitor.getString());
    });
}

// Attach to process
if (attach) {
    var client = new Client(host, port, attach);
    client.connect();
}

// Submit a new job
else if (submit) {
    var args = submit.split(' ');
    var command = args.splice(0,1).toString();
    var hubClient = http.createClient(port, host);
    var request = hubClient.request('POST', '/', {'Content-Type': 'application/json'});
    request.end(JSON.stringify({"command": command, "args": args}));
    // TODO: handle submission failure
    request.on('response', function (response) {
        var id = '';
        response.setEncoding('utf-8');
        response.on('data', function (chunk) {
            id += chunk;
        });
        response.on('end', function () {
            if (id !== '') {
                console.log('Submitted command: ' + command + '\nwith args: ' 
                            + args + '\nto host: ' + host + '\nwith id: ' + id);
            }
        });
    });
}

// Fetch results of a job
else if (fetch) {
    var cb = function (response) {
        console.log(response);
    }
    var response = getRequest('/results/' + fetch, cb);
}

// List jobs
else if (list) {
    var cb = function (response) {
        var joblist = JSON.parse(response);
        printJobList(joblist);
    }
    getRequest('/joblist', cb);
}
