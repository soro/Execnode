//  Connection manager class used in the hub.
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var ConMan = module.exports = function ConMan(hub) {
    if (!(this instanceof ConMan)) return new ConMan(hub);

    var self = this;
    // Key: job id, value: list of client connections 
    this.clientconns = {};
    // Key: job id, value: slave connection
    this.slaveConn = {};
    // Array of all webclients
    this.webclients = [];

    this.queue = hub.queue;
    // Key: job id, value: timeout timer
    this.timers = {};
    var timeoutDuration = 10000;

    this.cleanupConns = function (jobid) {
        // Try cleaning up connections. If they're already closed this will
        // throw an exception, so catch it before it kills the server.
        // TODO: once webclient is implemented need to clean up webclients here
        try {
            self.closeClientConns(jobid);
            self.getSlaveConn(jobid).close();
        }
        catch (e) {
        }
        delete self.slaveConn[jobid];
        delete self.clientconns[jobid];
    }
    this.closeClientConns = function (jobid) {
        var connids = Object.keys(self.clientconns[jobid]);
        var i = connids.length;
        while (i--) {
            var conn = self.clientconns[jobid][connids[i]];
            conn.close();
        }
    }
    this.getSlaveConn = function (jobid) {
        return self.slaveConn[jobid];
    }
    this.startTimeout = function (jobid) {
        self.timers[jobid] = setTimeout(function () { self.timedout(jobid); },
                                       timeoutDuration);
    }
    this.resetTimeout = function (jobid) {
        clearTimeout(self.timers[jobid]);
        self.timers[jobid] = setTimeout(function () { self.timedout(jobid); },
                                       timeoutDuration);
    }
    this.stopTimeout = function (jobid) {
        clearTimeout(self.timers[jobid]);
        delete self.timers[jobid];
    }
    this.timedout = function (jobid) {
        console.log("Job with id " + jobid + " has timed out");
        self.queue.markFailed(jobid);
        // Send a message to remaining clients and close their connections
        self.handleTermination(jobid, "timeout");
    }
    // Send status updates to web clients
    this.sendStatusUpdateWeb = function (jobid) {
        var data = {};
        data[jobid] = self.queue.jobs[jobid];
        self.webclients.forEach(function (conn, i, webclients) {
            conn.send(JSON.stringify(data));
        });
    }
    // Send status updates to command line clients
    this.sendStatusUpdateCL = function (jobid, stat) {
        if (self.clientconns[jobid] !== undefined) {
            var message = JSON.stringify({'kind': 'control',
                                          'data': stat});
            var connids = Object.keys(self.clientconns[jobid]);
            var i = connids.length;
            while (i--) {
                var conn = self.clientconns[jobid][connids[i]];
                conn.send(message);
            }
        }
    }
    // Handle a job termination for whatever reason
    this.handleTermination = function (jobid, reason) {
        var reasons = ["SIGKILL", "SIGTERM", 0, 1, "completed", "failed",
                       "terminated", "timeout"];
        if (reasons.indexOf(reason) >= 0) {
            // Send webclients the status update
            self.sendStatusUpdateWeb(jobid);
            // Stop the keepalive timeout
            self.stopTimeout(jobid);
            // Send command line clients the reason for termination
            self.sendStatusUpdateCL(jobid, reason);
            self.cleanupConns(jobid);
        }
    }
}
