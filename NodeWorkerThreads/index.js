// Suite for the `node:worker_threads` compatibility module.
//
// The suite gates itself on the module being requirable, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// node:worker_threads does not exist yet, rather than being wired in
// per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the module resolves (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate would
// quietly turn a regression that removed the module into a skipped suite.
//
// Clone failures are asserted by `.name === "DataCloneError"` rather than by
// `instanceof DOMException`: runtimes without a DOMException throw a plain
// Error carrying that name.

var wt = null;
try {
    wt = require("node:worker_threads");
} catch (e) {
    wt = null;
}

if (wt === null || typeof wt !== "object") {
    describe("node:worker_threads", function () {
        it("is skipped: this runtime does not implement node:worker_threads", function () {
            pending();
        });
    });
    return;
}

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

// The thread half of the module is a bridge over the platform Worker; without
// one there is nothing for those specs to drive.
var hasPlatformWorker = typeof globalObject.Worker === "function";
var hasStructuredClone = typeof globalObject.structuredClone === "function";

var DEFAULT_TIMEOUT_BEFORE_ASSERT = globalObject.NSObject ? 1000 : 4000;
// Below the per-spec jasmine timeout, so a worker that never answers fails one
// spec's assertions instead of timing out every spec that waits on it.
var WORKER_REPORT_TIMEOUT = 5000;

// App-root-relative: the platform Worker resolves a "./" path against its
// caller's script, and the shim's caller is the builtin module rather than this
// file.
var WORKER_PATH = "~/shared/NodeWorkerThreads/ThreadWorker.js";

// Spelled the same in ThreadWorker.js.
var BEFORE_SPAWN_KEY = "nodeWorkerThreadsSpec.beforeSpawn";
var AFTER_SPAWN_KEY = "nodeWorkerThreadsSpec.afterSpawn";

// The process-global environment store is never cleared, so every spec owns a
// key nothing else writes.
function envKey(name) {
    return "nodeWorkerThreadsSpec." + name;
}

function captureThrown(fn) {
    try {
        fn();
    } catch (e) {
        return e;
    }
    return null;
}

function expectThrowsNamed(name, message, fn) {
    var thrown = captureThrown(fn);
    expect(thrown).not.toBeNull();
    expect(thrown && thrown.name).toBe(name);
    expect(thrown && thrown.message).toBe(message);
}

function expectThrowsTypeError(fn) {
    var thrown = captureThrown(fn);
    expect(thrown).not.toBeNull();
    expect(thrown instanceof TypeError).toBe(true);
}

function expectThrowsMentioning(needle, fn) {
    var thrown = captureThrown(fn);
    expect(thrown).not.toBeNull();
    expect(thrown instanceof Error).toBe(true);
    expect(thrown && thrown.message.indexOf(needle)).toBeGreaterThan(-1);
}

// name -> typeof. parentPort and workerData are null on the main thread, which
// is where this table is asserted.
var expectedSurface = [
    ["BroadcastChannel", "function"],
    ["MessageChannel", "function"],
    ["MessagePort", "function"],
    ["SHARE_ENV", "symbol"],
    ["Worker", "function"],
    ["getEnvironmentData", "function"],
    ["isInternalThread", "boolean"],
    ["isMainThread", "boolean"],
    ["isMarkedAsUntransferable", "function"],
    ["markAsUncloneable", "function"],
    ["markAsUntransferable", "function"],
    ["moveMessagePortToContext", "function"],
    ["parentPort", "object"],
    ["postMessageToThread", "function"],
    ["receiveMessageOnPort", "function"],
    ["resourceLimits", "object"],
    ["setEnvironmentData", "function"],
    ["threadId", "number"],
    ["threadName", "undefined"],
    ["workerData", "object"]
];

describe(module.id, function () {
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000; // For slower android emulators
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    describe("module surface", function () {
        it("exports exactly the documented names", function () {
            var names = [];
            for (var i = 0; i < expectedSurface.length; i++) {
                names.push(expectedSurface[i][0]);
            }
            expect(Object.keys(wt).sort()).toEqual(names.sort());
        });

        it("gives every export the type Node gives it", function () {
            for (var i = 0; i < expectedSurface.length; i++) {
                var name = expectedSurface[i][0];
                expect(typeof wt[name]).toBe(expectedSurface[i][1], name);
            }
        });

        it("is frozen", function () {
            expect(Object.isFrozen(wt)).toBe(true);
        });

        it("exports SHARE_ENV as the well-known symbol", function () {
            expect(wt.SHARE_ENV).toBe(Symbol.for("nodejs.worker_threads.SHARE_ENV"));
        });

        it("reports the main thread", function () {
            expect(wt.isMainThread).toBe(true);
            expect(wt.threadId).toBe(0);
            expect(wt.isInternalThread).toBe(false);
            expect(wt.parentPort).toBeNull();
        });

        it("reports no resource limits, no thread name and no worker data", function () {
            expect(wt.resourceLimits).toEqual({});
            expect(Object.keys(wt.resourceLimits).length).toBe(0);
            expect(Object.prototype.hasOwnProperty.call(wt, "threadName")).toBe(true);
            expect(wt.threadName).toBeUndefined();
            expect(wt.workerData).toBeNull();
        });
    });

    describe("shared globals", function () {
        it("exports the same channel classes the globals hold", function () {
            expect(wt.MessagePort).toBe(globalObject.MessagePort);
            expect(wt.MessageChannel).toBe(globalObject.MessageChannel);
            expect(wt.BroadcastChannel).toBe(globalObject.BroadcastChannel);
        });

        it("exports a Worker of its own", function () {
            // The Node-shaped Worker is a wrapper class over the platform
            // constructor, not the constructor itself.
            expect(wt.Worker).not.toBe(globalObject.Worker);
            expect(typeof wt.Worker).toBe("function");
        });
    });

    describe("receiveMessageOnPort", function () {
        it("returns undefined for an empty queue", function () {
            var channel = new wt.MessageChannel();
            expect(wt.receiveMessageOnPort(channel.port2)).toBeUndefined();
            channel.port1.close();
            channel.port2.close();
        });

        it("drains one queued message into a box", function (done) {
            var channel = new wt.MessageChannel();
            channel.port1.postMessage({ hello: "world" });

            // Delivery runs through the event loop, so the message reaches the
            // queue a turn later. port2 is never started, which is what keeps it
            // there for the drain.
            setTimeout(function () {
                var result = wt.receiveMessageOnPort(channel.port2);
                expect(typeof result).toBe("object");
                expect(result.message).toEqual({ hello: "world" });
                expect(wt.receiveMessageOnPort(channel.port2)).toBeUndefined();
                channel.port1.close();
                channel.port2.close();
                done();
            }, 0);
        });

        it("boxes a message whose value is undefined", function (done) {
            var channel = new wt.MessageChannel();
            channel.port1.postMessage(undefined);

            setTimeout(function () {
                var result = wt.receiveMessageOnPort(channel.port2);
                // The box is what says a message was there at all, so an
                // undefined message stays distinguishable from an empty queue.
                expect(typeof result).toBe("object");
                expect(result).not.toBeNull();
                expect("message" in result).toBe(true);
                expect(result.message).toBeUndefined();
                channel.port1.close();
                channel.port2.close();
                done();
            }, 0);
        });

        it("removes the message it drains instead of peeking at it", function (done) {
            var channel = new wt.MessageChannel();
            channel.port1.postMessage("first");
            channel.port1.postMessage("second");

            setTimeout(function () {
                expect(wt.receiveMessageOnPort(channel.port2).message).toBe("first");

                var delivered = [];
                channel.port2.onmessage = function (event) {
                    delivered.push(event.data);
                };

                // Waits out delivery rather than racing it: the assertion is
                // that "first" never arrives, which has no callback of its own.
                setTimeout(function () {
                    expect(delivered).toEqual(["second"]);
                    channel.port1.close();
                    channel.port2.close();
                    done();
                }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
            }, 0);
        });
    });

    describe("environment data", function () {
        it("round-trips a structured-cloneable value", function () {
            var key = envKey("roundTrip");
            wt.setEnvironmentData(key, { a: 1, nested: { list: [1, 2, 3] } });
            expect(wt.getEnvironmentData(key)).toEqual({ a: 1, nested: { list: [1, 2, 3] } });
        });

        it("returns undefined for an unknown key", function () {
            expect(wt.getEnvironmentData(envKey("neverSet"))).toBeUndefined();
        });

        it("clones on the way in, so a later mutation of the original is invisible", function () {
            var key = envKey("cloneOnSet");
            var original = { list: [1, 2] };
            wt.setEnvironmentData(key, original);

            original.list.push(3);
            original.added = true;

            expect(wt.getEnvironmentData(key)).toEqual({ list: [1, 2] });
        });

        it("returns a fresh deserialization on every get", function () {
            var key = envKey("freshOnGet");
            wt.setEnvironmentData(key, { count: 1 });

            var first = wt.getEnvironmentData(key);
            var second = wt.getEnvironmentData(key);
            expect(first).not.toBe(second);
            expect(first).toEqual(second);

            first.count = 99;
            expect(wt.getEnvironmentData(key).count).toBe(1);
        });

        it("deletes the key when set without a value", function () {
            var key = envKey("deletion");
            wt.setEnvironmentData(key, { v: 1 });
            expect(wt.getEnvironmentData(key)).toEqual({ v: 1 });

            wt.setEnvironmentData(key);
            expect(wt.getEnvironmentData(key)).toBeUndefined();

            wt.setEnvironmentData(key, { v: 2 });
            wt.setEnvironmentData(key, undefined);
            expect(wt.getEnvironmentData(key)).toBeUndefined();
        });

        it("stringifies keys", function () {
            var numericKey = 20260826;
            wt.setEnvironmentData(numericKey, "numeric");
            expect(wt.getEnvironmentData(numericKey)).toBe("numeric");
            expect(wt.getEnvironmentData(String(numericKey))).toBe("numeric");
        });
    });

    describe("markAsUntransferable", function () {
        it("brands the object it is given", function () {
            var buffer = new ArrayBuffer(8);
            expect(wt.isMarkedAsUntransferable(buffer)).toBe(false);

            wt.markAsUntransferable(buffer);
            expect(wt.isMarkedAsUntransferable(buffer)).toBe(true);
        });

        (hasStructuredClone ? it : xit)("makes a transfer list reject the marked object", function () {
            var buffer = new ArrayBuffer(8);
            wt.markAsUntransferable(buffer);

            // The brand is checked ahead of the ArrayBuffer branch, so this is
            // the untransferable message rather than a buffer-specific one.
            expectThrowsNamed("DataCloneError", "Cannot transfer object of unsupported type.", function () {
                structuredClone(buffer, { transfer: [buffer] });
            });
            // Nothing changes hands until the whole graph has been written, so a
            // rejected transfer leaves the buffer as it found it.
            expect(buffer.byteLength).toBe(8);
        });

        it("reports false for anything that was never marked, and ignores non-objects", function () {
            expect(wt.isMarkedAsUntransferable({})).toBe(false);
            expect(wt.isMarkedAsUntransferable(new ArrayBuffer(4))).toBe(false);
            expect(wt.isMarkedAsUntransferable(null)).toBe(false);
            expect(wt.isMarkedAsUntransferable(undefined)).toBe(false);
            expect(wt.isMarkedAsUntransferable(42)).toBe(false);
            expect(wt.isMarkedAsUntransferable("not an object")).toBe(false);

            expect(function () {
                wt.markAsUntransferable(42);
                wt.markAsUntransferable(null);
            }).not.toThrow();
        });

        (hasStructuredClone ? it : xit)("marks the object, not its kind", function () {
            var marked = new ArrayBuffer(4);
            var plain = new ArrayBuffer(4);
            wt.markAsUntransferable(marked);

            expect(wt.isMarkedAsUntransferable(plain)).toBe(false);
            var clone = structuredClone(plain, { transfer: [plain] });
            expect(clone.byteLength).toBe(4);
            expect(plain.byteLength).toBe(0);
        });
    });

    describe("markAsUncloneable", function () {
        (hasStructuredClone ? it : xit)("makes an object refuse to be cloned", function () {
            var marked = { keep: 1 };
            wt.markAsUncloneable(marked);

            expectThrowsNamed("DataCloneError", "Cannot clone object of unsupported type.", function () {
                structuredClone(marked);
            });
            expect(marked.keep).toBe(1);
        });

        (hasStructuredClone ? it : xit)("rejects the whole graph a marked object sits in", function () {
            var marked = {};
            wt.markAsUncloneable(marked);

            expectThrowsNamed("DataCloneError", "Cannot clone object of unsupported type.", function () {
                structuredClone({ a: 1, nested: { marked: marked } });
            });
            expect(structuredClone({ a: 1, nested: {} })).toEqual({ a: 1, nested: {} });
        });
    });

    describe("unsupported entry points", function () {
        it("refuses postMessageToThread", function () {
            expectThrowsMentioning("is not supported", function () {
                wt.postMessageToThread();
            });
            expectThrowsMentioning("postMessageToThread", function () {
                wt.postMessageToThread(1, "message");
            });
        });

        it("refuses moveMessagePortToContext", function () {
            expectThrowsMentioning("is not supported", function () {
                wt.moveMessagePortToContext();
            });
            expectThrowsMentioning("moveMessagePortToContext", function () {
                wt.moveMessagePortToContext(null, null);
            });
        });
    });

    describe("Worker options", function () {
        it("rejects the options this runtime cannot honour, naming each one", function () {
            var rejected = [
                ["workerData", 1],
                ["env", {}],
                ["eval", true],
                ["transferList", []]
            ];

            for (var i = 0; i < rejected.length; i++) {
                var options = {};
                options[rejected[i][0]] = rejected[i][1];
                var thrown = captureThrown(function () {
                    new wt.Worker(WORKER_PATH, options);
                });
                expect(thrown).not.toBeNull();
                expect(thrown instanceof TypeError).toBe(true);
                expect(thrown && thrown.message.indexOf(rejected[i][0])).toBeGreaterThan(-1);
            }
        });

        it("rejects an explicit stdio request, naming the stream", function () {
            var streams = ["stdin", "stdout", "stderr"];

            for (var i = 0; i < streams.length; i++) {
                var options = {};
                options[streams[i]] = true;
                var thrown = captureThrown(function () {
                    new wt.Worker(WORKER_PATH, options);
                });
                expect(thrown).not.toBeNull();
                expect(thrown instanceof TypeError).toBe(true);
                expect(thrown && thrown.message.indexOf(streams[i])).toBeGreaterThan(-1);
            }
        });

        (hasPlatformWorker ? it : xit)("accepts the stdio options at their default false", function () {
            // They default to false in Node, so only an explicit request for a
            // stream this runtime has no plumbing for is an error.
            var worker = new wt.Worker(WORKER_PATH, { stdin: false, stdout: false, stderr: false });
            worker.terminate();
        });
    });

    describe("Worker events", function () {
        (hasPlatformWorker ? it : xit)("emits 'online' after construction, with no argument", function (done) {
            var worker = new wt.Worker(WORKER_PATH);
            worker.on("online", function (arg) {
                expect(arg).toBeUndefined();
                worker.terminate();
                done();
            });
        });

        (hasPlatformWorker ? it : xit)("returns the emitter from every registration call", function () {
            var worker = new wt.Worker(WORKER_PATH);
            var listener = function () {};

            expect(worker.on("spec:chain", listener)).toBe(worker);
            expect(worker.once("spec:chain", listener)).toBe(worker);
            expect(worker.off("spec:chain", listener)).toBe(worker);
            expect(worker.removeListener("spec:unregistered", listener)).toBe(worker);

            worker.terminate();
        });

        (hasPlatformWorker ? it : xit)("rejects a listener that is not a function", function () {
            var worker = new wt.Worker(WORKER_PATH);

            expectThrowsTypeError(function () { worker.on("spec:bad", null); });
            expectThrowsTypeError(function () { worker.on("spec:bad", 42); });
            expectThrowsTypeError(function () { worker.once("spec:bad", undefined); });
            expectThrowsTypeError(function () { worker.once("spec:bad", "listener"); });

            worker.terminate();
        });

        (hasPlatformWorker ? it : xit)("fires a once() listener exactly once", function () {
            var worker = new wt.Worker(WORKER_PATH);
            var calls = [];

            worker.once("spec:tick", function (arg) { calls.push(arg); });
            worker.emit("spec:tick", 1);
            worker.emit("spec:tick", 2);

            expect(calls).toEqual([1]);
            worker.terminate();
        });

        (hasPlatformWorker ? it : xit)("unregisters through off() and removeListener()", function () {
            var worker = new wt.Worker(WORKER_PATH);
            var calls = [];
            var first = function (arg) { calls.push("first:" + arg); };
            var second = function (arg) { calls.push("second:" + arg); };

            worker.on("spec:tick", first);
            worker.on("spec:tick", second);

            worker.off("spec:tick", first);
            worker.emit("spec:tick", 1);
            worker.removeListener("spec:tick", second);
            worker.emit("spec:tick", 2);

            expect(calls).toEqual(["second:1"]);
            worker.terminate();
        });

        (hasPlatformWorker ? it : xit)("emits 'message' with the raw data, not a MessageEvent", function (done) {
            var worker = new wt.Worker(WORKER_PATH);
            worker.on("message", function (data) {
                expect(data.kind).toBe("surface");
                // The shim unwraps event.data, so what the listener gets is the
                // posted value itself.
                expect(data.data).toBeUndefined();
                expect(data.type).toBeUndefined();
                worker.terminate();
                done();
            });
        });

        (hasPlatformWorker ? it : xit)("resolves terminate() with 0 and emits 'exit' with 0", function (done) {
            var worker = new wt.Worker(WORKER_PATH);
            var exitCodes = [];
            worker.on("exit", function (code) { exitCodes.push(code); });

            worker.terminate().then(function (code) {
                expect(code).toBe(0);
                expect(exitCodes).toEqual([0]);
                return worker.terminate();
            }).then(function (code) {
                expect(code).toBe(0);
                // 'exit' is reported once per worker, not once per terminate().
                expect(exitCodes).toEqual([0]);
                done();
            });
        });
    });

    describe("worker thread", function () {
        var reportPromise = null;

        // One worker answers every question in this block; the specs below each
        // wait on the same run rather than spawning one worker per assertion.
        function workerReport() {
            if (reportPromise !== null) {
                return reportPromise;
            }
            reportPromise = new Promise(function (resolve) {
                var collected = {};
                wt.setEnvironmentData(BEFORE_SPAWN_KEY, { origin: "main", when: "before" });

                var worker = new wt.Worker(WORKER_PATH);

                // Nothing else settles this promise if the worker never answers;
                // without it every spec below would wait out its own timeout.
                var guard = setTimeout(function () {
                    collected.timedOut = true;
                    worker.terminate();
                    resolve(collected);
                }, WORKER_REPORT_TIMEOUT);

                worker.on("error", function (error) {
                    collected.error = error;
                    clearTimeout(guard);
                    worker.terminate();
                    resolve(collected);
                });

                worker.on("message", function (data) {
                    if (data.kind === "surface") {
                        collected.surface = data;
                        // Written only once the worker is known to be running,
                        // so the value it reads back is one it could not have
                        // been handed at spawn time.
                        wt.setEnvironmentData(AFTER_SPAWN_KEY, { origin: "main", when: "after" });
                        worker.postMessage({ ping: "from parent" });
                    } else if (data.kind === "echo") {
                        collected.echo = data;
                        clearTimeout(guard);
                        worker.terminate();
                        resolve(collected);
                    }
                });
            });
            return reportPromise;
        }

        function withReport(done, assertions) {
            workerReport().then(function (report) {
                expect(report.error).toBeUndefined();
                expect(report.timedOut).toBeUndefined();
                expect(report.surface).toBeDefined();
                expect(report.echo).toBeDefined();
                if (report.surface && report.echo) {
                    assertions(report);
                }
                done();
            });
        }

        (hasPlatformWorker ? it : xit)("runs the helper on a worker thread", function (done) {
            withReport(done, function (report) {
                expect(report.surface.isMainThread).toBe(false);
                expect(report.surface.threadId).toBeGreaterThan(0);
            });
        });

        (hasPlatformWorker ? it : xit)("gives the worker a parentPort", function (done) {
            withReport(done, function (report) {
                expect(report.surface.hasParentPort).toBe(true);
                // Shaped like a MessagePort and named like one, but a distinct
                // class: it holds no queue and is not transferable.
                expect(report.surface.parentPortTag).toBe("[object MessagePort]");
                expect(report.surface.postMessageType).toBe("function");
                expect(report.surface.startType).toBe("function");
                expect(report.surface.closeType).toBe("function");
            });
        });

        (hasPlatformWorker ? it : xit)("forwards parentPort.postMessage to the parent", function (done) {
            withReport(done, function (report) {
                expect(report.surface.kind).toBe("surface");
                expect(typeof report.surface.threadId).toBe("number");
            });
        });

        (hasPlatformWorker ? it : xit)("re-dispatches the parent's message onto parentPort", function (done) {
            withReport(done, function (report) {
                expect(report.echo.eventIsObject).toBe(true);
                expect(report.echo.eventType).toBe("message");
                expect(report.echo.eventHasData).toBe(true);
                expect(report.echo.data).toEqual({ ping: "from parent" });
            });
        });

        (hasPlatformWorker ? it : xit)("sees environment data set before it was spawned", function (done) {
            withReport(done, function (report) {
                expect(report.surface.beforeSpawnEnvironmentData)
                    .toEqual({ origin: "main", when: "before" });
            });
        });

        (hasPlatformWorker ? it : xit)("sees environment data set after it was spawned", function (done) {
            // Deviation from Node, which snapshots the environment store when a
            // thread is spawned; this runtime reads one process-global store.
            withReport(done, function (report) {
                expect(report.echo.afterSpawnEnvironmentData)
                    .toEqual({ origin: "main", when: "after" });
            });
        });

        (hasPlatformWorker ? it : xit)("treats parentPort.close() as a no-op", function (done) {
            withReport(done, function (report) {
                expect(report.echo.closeThrew).toBe(false);
                // The echo was posted after close(): the channel outlives it.
                expect(report.echo.kind).toBe("echo");
            });
        });
    });
});
