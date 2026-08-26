// Suite for the BroadcastChannel interface (HTML Standard §9.5).
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// BroadcastChannel does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the global is there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// The named-group registry is process-wide — every isolate in the app, workers
// included — and an unclosed channel is held by the runtime forever. So every
// spec broadcasts under a name of its own (uniqueName) and opens its channels
// through openChannel, which the afterEach closes: leaked channels would both
// leak and cross-talk with later specs.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.BroadcastChannel === "undefined") {
    describe("BroadcastChannel", function () {
        it("is skipped: this runtime does not implement BroadcastChannel", function () {
            pending();
        });
    });
    return;
}

var BroadcastChannel = globalObject.BroadcastChannel;

// Waiting for an absence has no event to key `done` off; these specs give
// delivery a window that comfortably exceeds one event loop turn instead.
var DEFAULT_TIMEOUT_BEFORE_ASSERT = globalObject.NSObject ? 300 : 1000;

var nameCounter = 0;
var openChannels = [];

function uniqueName() {
    return "ns-tests-" + Date.now() + "-" + (nameCounter++);
}

function openChannel(name) {
    var channel = new BroadcastChannel(name);
    openChannels.push(channel);
    return channel;
}

function closeOpenChannels() {
    var channels = openChannels;
    openChannels = [];
    channels.forEach(function (channel) {
        channel.close();
    });
}

function expectThrowsTypeError(fn) {
    var thrown = null;
    try {
        fn();
    } catch (e) {
        thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(thrown instanceof TypeError).toBe(true);
}

describe(module.id, function () {
    afterEach(closeOpenChannels);

    it("requires the name argument", function () {
        expectThrowsTypeError(function () { new BroadcastChannel(); });
    });

    it("stringifies the name and exposes it through a getter", function () {
        var name = uniqueName();
        expect(openChannel(name).name).toBe(name);
        var numericName = Date.now();
        expect(openChannel(numericName).name).toBe(String(numericName));
        expect(openChannel({ toString: function () { return name + "-coerced"; } }).name)
            .toBe(name + "-coerced");

        var desc = Object.getOwnPropertyDescriptor(BroadcastChannel.prototype, "name");
        expect(typeof desc.get).toBe("function");
        expect(desc.set).toBeUndefined();
        expect(desc.enumerable).toBe(true);
    });

    it("is an EventTarget branded BroadcastChannel", function () {
        var channel = openChannel(uniqueName());
        expect(typeof channel.addEventListener).toBe("function");
        expect(typeof channel.dispatchEvent).toBe("function");
        if (typeof globalObject.EventTarget === "function") {
            expect(channel instanceof globalObject.EventTarget).toBe(true);
        }
        expect(BroadcastChannel.prototype[Symbol.toStringTag]).toBe("BroadcastChannel");
        expect(Object.prototype.toString.call(channel)).toBe("[object BroadcastChannel]");
    });

    // The spec's postMessage takes the message alone: a fan-out could not hand
    // one transferable to every destination.
    it("takes the message alone, ignoring any further argument", function () {
        expect(BroadcastChannel.prototype.postMessage.length).toBe(1);
        var channel = openChannel(uniqueName());
        expect(function () { channel.postMessage("m", [new ArrayBuffer(8)]); }).not.toThrow();
    });

    it("throws when postMessage is called without arguments", function () {
        var channel = openChannel(uniqueName());
        expectThrowsTypeError(function () { channel.postMessage(); });
    });

    it("delivers a MessageEvent to a channel of the same name", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var receiver = openChannel(name);

        receiver.onmessage = function (event) {
            expect(event.type).toBe("message");
            expect(event.data).toBe("hello");
            if (typeof globalObject.MessageEvent === "function") {
                expect(event instanceof globalObject.MessageEvent).toBe(true);
            }
            done();
        };

        sender.postMessage("hello");
    });

    it("does not deliver back to the sender", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var receiver = openChannel(name);
        var senderCount = 0;
        var receiverCount = 0;

        sender.onmessage = function () { senderCount++; };
        receiver.onmessage = function () { receiverCount++; };

        sender.postMessage("hello");

        setTimeout(function () {
            expect(receiverCount).toBe(1);
            expect(senderCount).toBe(0);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("does not deliver to a channel of a different name", function (done) {
        var sender = openChannel(uniqueName());
        var stranger = openChannel(uniqueName());
        var count = 0;

        stranger.onmessage = function () { count++; };

        sender.postMessage("hello");

        setTimeout(function () {
            expect(count).toBe(0);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("fans one message out to every other channel in the group", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var first = openChannel(name);
        var second = openChannel(name);
        var received = [];

        function record(event) {
            received.push(event.data);
            if (received.length === 2) {
                expect(received).toEqual(["fan", "fan"]);
                done();
            }
        }

        first.onmessage = record;
        second.onmessage = record;

        sender.postMessage("fan");
    });

    it("delivers to onmessage and addEventListener in first-assignment order", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var receiver = openChannel(name);
        var order = [];

        receiver.onmessage = function () { order.push("handler"); };
        receiver.addEventListener("message", function () {
            order.push("listener");
            expect(order).toEqual(["handler", "listener"]);
            done();
        });

        sender.postMessage("hello");
    });

    it("preserves the order of messages from one sender", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var receiver = openChannel(name);
        var received = [];

        receiver.onmessage = function (event) {
            received.push(event.data);
            if (received.length === 3) {
                expect(received).toEqual(["one", "two", "three"]);
                done();
            }
        };

        sender.postMessage("one");
        sender.postMessage("two");
        sender.postMessage("three");
    });

    it("structured-clones the message", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var receiver = openChannel(name);
        var payload = { nested: { count: 1 }, when: new Date(1700000000000) };

        receiver.onmessage = function (event) {
            expect(event.data).not.toBe(payload);
            expect(event.data.nested).toEqual({ count: 1 });
            expect(event.data.when instanceof Date).toBe(true);
            expect(event.data.when.getTime()).toBe(1700000000000);
            done();
        };

        sender.postMessage(payload);
    });

    it("throws InvalidStateError from postMessage on a closed channel", function () {
        var channel = openChannel(uniqueName());
        channel.close();

        var thrown = null;
        try {
            channel.postMessage("hello");
        } catch (e) {
            thrown = e;
        }
        expect(thrown).not.toBeNull();
        expect(thrown && thrown.name).toBe("InvalidStateError");
        expect(thrown && thrown.message).toBe("BroadcastChannel is closed.");
        if (typeof globalObject.DOMException === "function") {
            expect(thrown instanceof globalObject.DOMException).toBe(true);
        }
    });

    it("closes idempotently, keeping the name readable", function () {
        var name = uniqueName();
        var channel = openChannel(name);
        expect(function () {
            channel.close();
            channel.close();
            channel.close();
        }).not.toThrow();
        expect(channel.name).toBe(name);
    });

    it("throws DataCloneError for a message that cannot be serialized", function () {
        var channel = openChannel(uniqueName());
        var thrown = null;
        try {
            channel.postMessage(function () { return 42; });
        } catch (e) {
            thrown = e;
        }
        expect(thrown).not.toBeNull();
        expect(thrown && thrown.name).toBe("DataCloneError");
    });

    it("stops delivering to a closed channel", function (done) {
        var name = uniqueName();
        var sender = openChannel(name);
        var closed = openChannel(name);
        var stillOpen = openChannel(name);
        var closedCount = 0;
        var openCount = 0;

        closed.onmessage = function () { closedCount++; };
        stillOpen.onmessage = function () { openCount++; };
        closed.close();

        sender.postMessage("hello");

        setTimeout(function () {
            expect(openCount).toBe(1);
            expect(closedCount).toBe(0);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });
});

describe(module.id + " across isolates", function () {
    var hasWorker = typeof globalObject.Worker === "function";
    var itWithWorker = hasWorker ? it : xit;
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000; // For slower android emulators
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
        closeOpenChannels();
    });

    itWithWorker("round-trips a message through a channel a worker joined", function (done) {
        var name = uniqueName();
        var channel = openChannel(name);
        var worker = new Worker("./BroadcastWorker");

        function finish(failure) {
            worker.terminate();
            done(failure);
        }

        channel.onmessage = function (event) {
            expect(event.data).toBe("worker echo: ping");
            worker.postMessage("close");
        };

        worker.onerror = function (e) {
            finish("worker error: " + (e && e.message));
        };

        worker.onmessage = function (msg) {
            if (msg.data === "joined") {
                channel.postMessage("ping");
            } else if (msg.data === "closed") {
                finish();
            }
        };

        worker.postMessage({ join: name });
    });
});
