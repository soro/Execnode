#!/usr/bin/env node

//  Command line executable that starts an execnode hub.
//  (c) 2011 Soeren Roerden
//  execnode is freely distributable under the MIT license (license.txt)

var Hub = require('execnode').Hub;
var conf = require('../conf/hubconf');

hub = new Hub();

console.log('Listening on ' + conf.listen_address + ':' + conf.listen_port);
hub.listen(conf.listen_port, conf.listen_address);
