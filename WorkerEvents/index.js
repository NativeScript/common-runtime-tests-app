// Suite for Worker and the worker global scope as EventTargets (HTML Standard
// §10.2.1 and §10.2.6): both deliver MessageEvents through a listener list
// rather than calling an `onmessage` property directly, and a worker error the
// worker scope did not handle reaches the parent as an ErrorEvent on the
// Worker object.
//
// The suite gates itself on Worker and MessageEvent being present, so it can
// sit in runAllTests() on every runtime and report a visible pending spec
// where the messaging tier does not exist yet, rather than being wired in
// per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the globals are there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// The spec at the bottom pins a behavior that is NOT what a browser does. It is
// a documented deviation of this runtime (docs/worker-threads.md on iOS), and
// it is asserted here so that changing it is a deliberate act.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.Worker === "undefined" ||
    typeof globalObject.MessageEvent === "undefined" ||
    typeof globalObject.ErrorEvent === "undefined" ||
    typeof globalObject.MessageChannel === "undefined") {
    describe("Worker events", function () {
        it("is skipped: this runtime does not implement worker message events", function () {
            pending();
        });
    });
    return;
}

var MessageEvent = globalObject.MessageEvent;
var MessageChannel = globalObject.MessageChannel;
var MessagePort = globalObject.MessagePort;
var ErrorEvent = globalObject.ErrorEvent;

describe(module.id, function () {
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    describe("Worker as an EventTarget", function () {
        it("puts EventTarget in the Worker prototype chain", function () {
            var worker = new Worker("./ScopeEventsWorker");
            expect(worker instanceof EventTarget).toBe(true);
            expect(typeof worker.addEventListener).toBe("function");
            expect(typeof worker.removeEventListener).toBe("function");
            worker.terminate();
        });

        it("delivers a real MessageEvent to worker.onmessage", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            worker.onmessage = function (event) {
                expect(event instanceof MessageEvent).toBe(true);
                expect(event instanceof Event).toBe(true);
                expect(event.type).toBe("message");
                expect(event.target).toBe(worker);
                expect(event.ports).toEqual([]);
                expect(event.data.data).toBe("from the parent");
                worker.terminate();
                done();
            };
            worker.postMessage("from the parent");
        });

        it("reads the onmessage handler back and clears it to null", function () {
            var worker = new Worker("./ScopeEventsWorker");
            var handler = function () {};
            expect(worker.onmessage).toBe(null);
            worker.onmessage = handler;
            expect(worker.onmessage).toBe(handler);
            worker.onmessage = null;
            expect(worker.onmessage).toBe(null);
            worker.terminate();
        });

        it("runs onmessage and addEventListener registrations in assignment order", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            var order = [];
            worker.addEventListener("message", function () { order.push("listener1"); });
            worker.onmessage = function () { order.push("handler"); };
            worker.addEventListener("message", function () {
                order.push("listener2");
                expect(order).toEqual(["listener1", "handler", "listener2"]);
                worker.terminate();
                done();
            });
            worker.postMessage("go");
        });

        it("stops calling a removed listener", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            var calls = 0;
            var listener = function () { calls++; };
            worker.addEventListener("message", listener);
            worker.removeEventListener("message", listener);
            worker.onmessage = function () {
                expect(calls).toBe(0);
                worker.terminate();
                done();
            };
            worker.postMessage("go");
        });
    });

    describe("worker global scope as an EventTarget", function () {
        it("fires the global onmessage attribute and an addEventListener registration in order", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            worker.onmessage = function (event) {
                var report = event.data;
                expect(report.order).toEqual(["listener", "handler"]);
                expect(report.type).toBe("message");
                expect(report.data).toBe("scope check");
                expect(report.isEvent).toBe(true);
                expect(report.isMessageEvent).toBe(true);
                expect(report.ports).toBe(0);
                worker.terminate();
                done();
            };
            worker.postMessage("scope check");
        });

        it("reads the global onmessage attribute back through globalThis", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            worker.onmessage = function (event) {
                expect(event.data.onmessageReadsBack).toBe(true);
                worker.terminate();
                done();
            };
            worker.postMessage("scope check");
        });
    });

    describe("port transfer to a worker", function () {
        it("hands a MessagePort over and then talks on it in both directions", function (done) {
            var worker = new Worker("./PortWorker");
            var channel = new MessageChannel();

            worker.onmessage = function (event) {
                expect(event.data.ready).toBe(true);
                expect(event.data.portCount).toBe(1);
                // The port in the message graph and the one in event.ports are
                // the same object on the receiving side too.
                expect(event.data.portInGraph).toBe(true);

                channel.port1.onmessage = function (portEvent) {
                    expect(portEvent.data).toBe("worker echoes hello");
                    channel.port1.close();
                    worker.terminate();
                    done();
                };
                channel.port1.postMessage("hello");
            };

            worker.postMessage({ port: channel.port2 }, [channel.port2]);
            expect(channel.port2 instanceof MessagePort).toBe(true);
        });

        it("transfers an ArrayBuffer alongside the port", function (done) {
            var worker = new Worker("./PortWorker");
            var channel = new MessageChannel();
            var buffer = new ArrayBuffer(8);

            worker.onmessage = function (event) {
                expect(event.data.ready).toBe(true);
                expect(event.data.bufferLength).toBe(8);
                channel.port1.close();
                worker.terminate();
                done();
            };

            worker.postMessage(
                { port: channel.port2, buffer: buffer },
                [channel.port2, buffer]
            );
            expect(buffer.byteLength).toBe(0);
        });

        it("rejects a transfer list the worker could never honour", function () {
            var worker = new Worker("./PortWorker");
            var thrown = null;
            try {
                worker.postMessage({}, [{}]);
            } catch (e) {
                thrown = e;
            }
            expect(thrown).not.toBeNull();
            expect(thrown && thrown.name).toBe("DataCloneError");
            worker.terminate();
        });
    });

    describe("worker errors on the parent", function () {
        it("delivers a real ErrorEvent to onerror and addEventListener in registration order", function (done) {
            var worker = new Worker("./ThrowingWorker");
            var order = [];
            var firstSeen = null;

            worker.addEventListener("error", function (event) {
                order.push("listener1");
                firstSeen = event;
            });
            worker.onerror = function () { order.push("handler"); };
            worker.addEventListener("error", function (event) {
                order.push("listener2");
                expect(order).toEqual(["listener1", "handler", "listener2"]);
                expect(event).toBe(firstSeen);
                expect(event instanceof ErrorEvent).toBe(true);
                expect(event instanceof Event).toBe(true);
                expect(event.type).toBe("error");
                expect(event.target).toBe(worker);
                expect(typeof event.message).toBe("string");
                expect(event.message.indexOf("worker helper threw on purpose")).toBeGreaterThan(-1);
                // Only primitives cross the isolate boundary, so the event
                // never carries the worker's error object.
                expect(event.error).toBe(null);
                // A handler that returns nothing leaves the error unhandled.
                expect(event.defaultPrevented).toBe(false);
                worker.terminate();
                done();
            });

            worker.postMessage("go");
        });

        // The worker helper installs no scope `onerror` at all: an error the
        // worker scope never handles still has to reach the parent.
        it("delivers an error from a worker whose scope never handles it", function (done) {
            var worker = new Worker("./ThrowingWorker");
            worker.onerror = function (event) {
                expect(event.type).toBe("error");
                expect(typeof event.filename).toBe("string");
                expect(typeof event.lineno).toBe("number");
                worker.terminate();
                done();
            };
            worker.postMessage("go");
        });

        it("marks the error handled when a listener calls preventDefault()", function (done) {
            var worker = new Worker("./ThrowingWorker");
            worker.addEventListener("error", function (event) { event.preventDefault(); });
            worker.addEventListener("error", function (event) {
                expect(event.defaultPrevented).toBe(true);
                worker.terminate();
                done();
            });
            worker.postMessage("go");
        });

        // HTML §8.1.7.3: `onerror` is the one handler attribute whose return
        // value is observable — a truthy return cancels the event, which is how
        // this runtime has always spelled "the error was handled".
        it("marks the error handled when onerror returns truthy", function (done) {
            var worker = new Worker("./ThrowingWorker");
            worker.onerror = function () { return true; };
            worker.addEventListener("error", function (event) {
                expect(event.defaultPrevented).toBe(true);
                worker.terminate();
                done();
            });
            worker.postMessage("go");
        });
    });

    describe("documented deviations", function () {
        // A browser dispatches scope messages at the global object itself. This
        // runtime dispatches at the internal EventTarget backing the global
        // listener methods, so app code cannot intercept delivery by replacing
        // globalThis.dispatchEvent. Asserted loosely: what `target` IS is an
        // implementation detail, what it is NOT is the deviation.
        it("does not set event.target to globalThis inside the worker scope", function (done) {
            var worker = new Worker("./ScopeEventsWorker");
            worker.onmessage = function (event) {
                expect(event.data.targetIsGlobalThis).toBe(false);
                expect(event.data.hasTarget).toBe(true);
                worker.terminate();
                done();
            };
            worker.postMessage("scope check");
        });
    });
});
