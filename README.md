Execnode
========

Execnode is a remote subprocess execution environment. So far it consists of a 
command line tool (<code>xn</code>) that allows one to submit jobs to the 
central server, the hub (<code>xnhub</code>), fetch the results of these jobs 
once they have been executed by the slaves (<code>xnslave</code>>),
which pull jobs from the hub, and allows one to attach to the stdin and stdout
of the subprocesses running on the slaves, which is what distinguishes execnode
from other such environments. This even makes it possible to remotely start
interpreters or a bash session.

Since the slaves run with the full privileges of the user executing them,
they should be sandboxed. Authentication support will probably be added, but
so far does not exist.
I will probably also add a web interface at some point.

All three components of execnode use websockets and HTTP to talk to each other.
The format of the data exchanged is JSON.

Execnode was inspired by the xnet project started by Holger Krekel.

Installation
------------

To give execnode a try, install [npm](https://github.com/isaacs/npm) 
(the node package manager) on your system and perform the following steps:

```bash
git clone git://github.com/soro/execnode.git ./execnode
cd execnode
npm link
```

This should install all dependencies and put the commands <code>xn</code>, 
<code>xnhub</code> and <code>xnslave</code> on your path.

Usage
-----

To start a hub, simply execute:

```bash
xnhub
```

You can then start a slave in a separate shell using:

```bash
xnslave
```

After you have started both a hub and a slave, you can start submitting jobs
as in the following:

```bash
xn -s "ls /"
xn -s "python -i"
xn -s "bash"
```

To list all the jobs currently registered with the hub, use

```bash
xn -l
```

If you want to fetch the result of a job, use the option "-f" followed by the id
of the job you are interested in.
To interactively attach to a job, use the option "-a", followed by the job id.
This will usually only be of interest for jobs that require input or will run
for a longer period of time, like a test suite.
In general, using <code>xn --help</code> will give you a full list of available
options.
To terminate a running job while you are attached to it, enter "/term".

Documentation
-------------

Docco generated source code documentation can be found in the docs folder.

Hacking
-------

If you are interested,
there is still quite a lot of room for improvement, first and foremost the
authentication and authorization support. The web interface would also be an
interesting project to work on and more tests would be useful as well.
It would be nice to have the option of describing jobs in json files or in 
some other file based way, so that one doesn't always have to use command
line parameters.

Legal Stuff
-----------

All of execnode is licensed under the MIT license (see included license.txt).
