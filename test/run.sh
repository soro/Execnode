#!/bin/bash

OWN_PATH="$0"
cd "${OWN_PATH:2:5}"
# upon nodeunit test.* slave test fails due to address in use error - look into that
nodeunit test.hub.js
nodeunit test.conman.js
nodeunit test.slave.js
