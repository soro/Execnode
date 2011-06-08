#!/usr/bin/env node

//  Execnode server
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var Slave = require('execnode').Slave;
var conf = require('../conf/slaveconf');

process.on('SIGINT', function () {
    slave.handle_sigint();
});

var maxActive = 2;
console.log('Polling ' + conf.server_url + ':' + conf.server_port + ' for work');
slave = new Slave(conf.server_url, conf.server_port);
setInterval(function () {
    // TODO: fix the limiting of number of active jobs
    if (slave.activecount <= maxActive) {
        slave.fetch();
        slave.startNext();
    }
}, 1000);
