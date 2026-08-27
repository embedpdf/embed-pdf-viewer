/**
 * Boot-failure test double: dies before the 'ready' handshake, with no
 * 'error' event — the case that used to hang WorkerThreadPool.create.
 */
process.exit(3);
