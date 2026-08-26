// Worker half of the node:worker_threads suite.
//
// One worker answers every worker-side question the suite asks: it reports the
// module's worker-thread surface on load, then echoes back whatever the parent
// sends. The parent asserts the plain object this posts.
//
// The environment-data keys are spelled the same here and in index.js: this
// runtime's Worker rejects the `workerData` option, so a fixed key is the only
// way the two halves can agree on what to look for.

var wt = require("node:worker_threads");

var BEFORE_SPAWN_KEY = "nodeWorkerThreadsSpec.beforeSpawn";
var AFTER_SPAWN_KEY = "nodeWorkerThreadsSpec.afterSpawn";

var parentPort = wt.parentPort;

parentPort.onmessage = function (event) {
    var closeThrew = false;
    try {
        parentPort.close();
    } catch (e) {
        closeThrew = true;
    }

    // Posted after close(): a worker ends through its own close()/terminate(),
    // so the parent channel has to survive this call.
    parentPort.postMessage({
        kind: "echo",
        eventIsObject: typeof event === "object" && event !== null,
        eventType: event ? event.type : undefined,
        eventHasData: !!event && "data" in event,
        data: event ? event.data : undefined,
        afterSpawnEnvironmentData: wt.getEnvironmentData(AFTER_SPAWN_KEY),
        closeThrew: closeThrew
    });
};

parentPort.postMessage({
    kind: "surface",
    isMainThread: wt.isMainThread,
    threadId: wt.threadId,
    hasParentPort: parentPort !== null && parentPort !== undefined,
    parentPortTag: Object.prototype.toString.call(parentPort),
    postMessageType: typeof parentPort.postMessage,
    startType: typeof parentPort.start,
    closeType: typeof parentPort.close,
    beforeSpawnEnvironmentData: wt.getEnvironmentData(BEFORE_SPAWN_KEY)
});
