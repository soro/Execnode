//  Job queue used in execnode hub.
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var JobQueue = module.exports = function JobQueue(hub) {
    if (!(this instanceof JobQueue)) return new JobQueue(hub);

    this.hub = hub;
    this.jobs = {};
    // Key: job id, value: complete stdout of job 
    this.completed = {};
    // Array of queued jobids
    this.queued = [];
    // Id counter
    this.nextId = 0;

    // Increment the id counter and return a new id
    this.newId = function () {
        var id = this.nextId;
        this.nextId += 1;
        return id;
    };
    // Add a job to the queue
    this.enqueue = function (job) {
        var jobid = this.newId(); 
        (this.jobs[jobid] = {}).status = "queued";
        this.queued.push(jobid);
        this.jobs[jobid].id = jobid;
        this.jobs[jobid].jobspec = job;
        return jobid;
    };
    // Delete a job from queue and return it. good place to implement
    // prioritization
    this.pull = function () {
        var id = this.queued.pop();
        if (id !== undefined) {
            var job = this.jobs[id];
            this.jobs[id].status = "pulled";
            return job;
        }
        else { return undefined; }
    };
    this.markActive = function (jobid) {
        this.jobs[jobid].status = "active";
    };
    this.markFailed = function (jobid) {
        this.jobs[jobid].status = "failed";
    };
    this.postResult = function (jobid, result, code) {
        this.completed[jobid] = result;
        this.jobs[jobid].status = code;
    };
    this.fetchResult = function (jobid) {
        var result = this.completed[jobid];
        this.cleanupJobs(jobid);
        return result;
    };
    // Remove objects from lists. pull removes the job from queued.
    this.cleanupJobs = function (jobid) {
        delete this.jobs[jobid];
        delete this.completed[jobid];
    };
    this.listJobs = function () {
        return this.jobs;
    };
    this.getStatus = function (jobid) {
        return this.jobs[jobid].status;
    };
    this.jobExists = function (jobid) {
        if (this.jobs[jobid] !== undefined) {
            return true;
        }
        return false;
    };
}
