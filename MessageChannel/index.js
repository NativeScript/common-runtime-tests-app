// Suite for MessagePort and MessageChannel (HTML Standard §9.4).
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// MessageChannel does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the globals are there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// Clone and transfer failures are asserted by `.name === "DataCloneError"`
// rather than by `instanceof DOMException`: runtimes without a DOMException
// throw a plain Error carrying that name.
//
// Every port a spec opens is closed again: a port is held strongly by the
// runtime from creation until close, so a leaked port keeps its channel and
// its queue alive for the rest of the process.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.MessageChannel === "undefined" ||
    typeof globalObject.MessagePort === "undefined") {
    describe("MessageChannel", function () {
        it("is skipped: this runtime does not implement MessageChannel", function () {
            pending();
        });
    });
    return;
}

var MessageChannel = globalObject.MessageChannel;
var MessagePort = globalObject.MessagePort;

// Delivery goes through the event loop, so every assertion about a message
// having arrived — or deliberately not having arrived — waits a turn first.
var TICK = globalObject.NSObject ? 60 : 300;
// Long enough that a message which was going to arrive would have.
var SETTLE = globalObject.NSObject ? 400 : 1500;

function expectThrowsNamed(name, fn) {
    var thrown = null;
    try {
        fn();
    } catch (e) {
        thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(thrown && thrown.name).toBe(name);
    return thrown;
}

function closeAll() {
    for (var i = 0; i < arguments.length; i++) {
        var port = arguments[i];
        if (port) {
            port.close();
        }
    }
}

describe(module.id, function () {
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000;
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    describe("interface", function () {
        it("exposes MessagePort and MessageChannel as constructors", function () {
            expect(typeof MessagePort).toBe("function");
            expect(typeof MessageChannel).toBe("function");
        });

        it("refuses to construct a MessagePort directly", function () {
            expect(function () { return new MessagePort(); }).toThrowError(TypeError);
        });

        it("chains MessagePort onto EventTarget", function () {
            expect(Object.getPrototypeOf(MessagePort.prototype))
                .toBe(EventTarget.prototype);
            expect(typeof MessagePort.prototype.postMessage).toBe("function");
            expect(typeof MessagePort.prototype.start).toBe("function");
            expect(typeof MessagePort.prototype.close).toBe("function");
        });

        it("brands both interfaces with a toStringTag", function () {
            var channel = new MessageChannel();
            expect(Object.prototype.toString.call(channel)).toBe("[object MessageChannel]");
            expect(Object.prototype.toString.call(channel.port1)).toBe("[object MessagePort]");
            closeAll(channel.port1, channel.port2);
        });

        it("gives a channel two distinct ports", function () {
            var channel = new MessageChannel();
            expect(channel.port1 instanceof MessagePort).toBe(true);
            expect(channel.port2 instanceof MessagePort).toBe(true);
            expect(channel.port1 instanceof EventTarget).toBe(true);
            expect(channel.port1).not.toBe(channel.port2);
            closeAll(channel.port1, channel.port2);
        });

        it("keeps a port's internals off its enumerable properties", function () {
            var channel = new MessageChannel();
            // A port is a platform object: the listener bag EventTarget keeps
            // per instance must not show up as app-visible state.
            expect(Object.keys(channel.port1)).toEqual([]);
            closeAll(channel.port1, channel.port2);
        });
    });

    describe("delivery", function () {
        it("carries a message from one end to the other", function (done) {
            var channel = new MessageChannel();
            channel.port2.onmessage = function (event) {
                expect(event.data).toBe("ping");
                closeAll(channel.port1, channel.port2);
                done();
            };
            channel.port1.postMessage("ping");
        });

        it("delivers in both directions on the same channel", function (done) {
            var channel = new MessageChannel();
            channel.port2.onmessage = function (event) {
                channel.port2.postMessage(event.data + "-pong");
            };
            channel.port1.onmessage = function (event) {
                expect(event.data).toBe("ping-pong");
                closeAll(channel.port1, channel.port2);
                done();
            };
            channel.port1.postMessage("ping");
        });

        it("structured-clones the payload rather than sharing it", function (done) {
            var channel = new MessageChannel();
            var sent = { nested: { n: 1 } };
            channel.port2.onmessage = function (event) {
                expect(event.data).not.toBe(sent);
                expect(event.data.nested.n).toBe(1);
                closeAll(channel.port1, channel.port2);
                done();
            };
            channel.port1.postMessage(sent);
            sent.nested.n = 2;
        });

        it("preserves send order", function (done) {
            var channel = new MessageChannel();
            var got = [];
            channel.port2.onmessage = function (event) {
                got.push(event.data);
                if (got.length === 3) {
                    expect(got).toEqual([1, 2, 3]);
                    closeAll(channel.port1, channel.port2);
                    done();
                }
            };
            channel.port1.postMessage(1);
            channel.port1.postMessage(2);
            channel.port1.postMessage(3);
        });

        it("delivers a MessageEvent with the spec's field defaults", function (done) {
            var channel = new MessageChannel();
            channel.port2.onmessage = function (event) {
                expect(event.type).toBe("message");
                expect(event.data).toBe(42);
                expect(event.origin).toBe("");
                expect(event.lastEventId).toBe("");
                expect(event.source).toBe(null);
                expect(event.ports).toEqual([]);
                expect(event.target).toBe(channel.port2);
                closeAll(channel.port1, channel.port2);
                done();
            };
            channel.port1.postMessage(42);
        });

        it("rejects a value that cannot be cloned", function () {
            var channel = new MessageChannel();
            expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(function () {});
            });
            closeAll(channel.port1, channel.port2);
        });
    });

    describe("port enabling", function () {
        it("holds messages until the port gets its first message listener", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("queued");
            setTimeout(function () {
                var got = [];
                channel.port2.addEventListener("message", function (event) {
                    got.push(event.data);
                });
                setTimeout(function () {
                    expect(got).toEqual(["queued"]);
                    closeAll(channel.port1, channel.port2);
                    done();
                }, TICK);
            }, TICK);
        });

        it("enables the port from an onmessage assignment", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("queued");
            setTimeout(function () {
                channel.port2.onmessage = function (event) {
                    expect(event.data).toBe("queued");
                    closeAll(channel.port1, channel.port2);
                    done();
                };
            }, TICK);
        });

        // HTML enables the port on the FIRST assignment to onmessage whatever
        // the value is, so `onmessage = null` starts delivery with nothing
        // listening: the queued message runs through dispatch and is dropped.
        it("enables — and therefore drops — on an onmessage = null first write", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("dropped");
            setTimeout(function () {
                channel.port2.onmessage = null;
                setTimeout(function () {
                    var got = [];
                    channel.port2.onmessage = function (event) {
                        got.push(event.data);
                    };
                    channel.port1.postMessage("kept");
                    setTimeout(function () {
                        expect(got).toEqual(["kept"]);
                        closeAll(channel.port1, channel.port2);
                        done();
                    }, TICK);
                }, SETTLE);
            }, TICK);
        });

        it("start() enables a port that has no listener yet", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("first");
            channel.port2.start();
            setTimeout(function () {
                var got = [];
                channel.port2.addEventListener("message", function (event) {
                    got.push(event.data);
                });
                channel.port1.postMessage("second");
                setTimeout(function () {
                    // "first" was delivered while nothing was listening.
                    expect(got).toEqual(["second"]);
                    closeAll(channel.port1, channel.port2);
                    done();
                }, TICK);
            }, SETTLE);
        });

        it("stops delivering when the last message listener goes and resumes when one returns", function (done) {
            var channel = new MessageChannel();
            var got = [];
            var handler = function (event) { got.push(event.data); };
            channel.port2.onmessage = handler;
            channel.port1.postMessage(1);
            setTimeout(function () {
                expect(got).toEqual([1]);
                // Clearing the handler leaves its slot registered but inert,
                // which takes the port's listener count back to zero.
                channel.port2.onmessage = null;
                channel.port1.postMessage(2);
                setTimeout(function () {
                    expect(got).toEqual([1]);
                    channel.port2.onmessage = handler;
                    setTimeout(function () {
                        expect(got).toEqual([1, 2]);
                        closeAll(channel.port1, channel.port2);
                        done();
                    }, TICK);
                }, SETTLE);
            }, TICK);
        });

        it("stops delivering when the last addEventListener registration is removed", function (done) {
            var channel = new MessageChannel();
            var got = [];
            var handler = function (event) { got.push(event.data); };
            channel.port2.addEventListener("message", handler);
            channel.port1.postMessage(1);
            setTimeout(function () {
                expect(got).toEqual([1]);
                channel.port2.removeEventListener("message", handler);
                channel.port1.postMessage(2);
                setTimeout(function () {
                    expect(got).toEqual([1]);
                    channel.port2.addEventListener("message", handler);
                    setTimeout(function () {
                        expect(got).toEqual([1, 2]);
                        closeAll(channel.port1, channel.port2);
                        done();
                    }, TICK);
                }, SETTLE);
            }, TICK);
        });
    });

    describe("onmessage handler attribute", function () {
        it("reads back the assigned function and null when cleared", function () {
            var channel = new MessageChannel();
            var handler = function () {};
            expect(channel.port1.onmessage).toBe(null);
            channel.port1.onmessage = handler;
            expect(channel.port1.onmessage).toBe(handler);
            channel.port1.onmessage = null;
            expect(channel.port1.onmessage).toBe(null);
            closeAll(channel.port1, channel.port2);
        });

        it("coerces a non-callable, non-object assignment to null", function () {
            var channel = new MessageChannel();
            channel.port1.onmessage = 42;
            expect(channel.port1.onmessage).toBe(null);
            channel.port1.onmessage = "handler";
            expect(channel.port1.onmessage).toBe(null);
            closeAll(channel.port1, channel.port2);
        });

        it("runs the handler alongside addEventListener registrations in order", function (done) {
            var channel = new MessageChannel();
            var order = [];
            channel.port2.onmessage = function () { order.push(1); };
            channel.port2.addEventListener("message", function () { order.push(2); });
            channel.port2.addEventListener("message", function () { order.push(3); });
            channel.port2.addEventListener("message", function () {
                order.push(4);
                expect(order).toEqual([1, 2, 3, 4]);
                closeAll(channel.port1, channel.port2);
                done();
            });
            channel.port1.postMessage(null);
        });

        // The handler occupies the slot it was FIRST assigned at; replacing the
        // function does not move it to the end of the listener list.
        it("keeps the handler at the position of its first assignment", function (done) {
            var channel = new MessageChannel();
            var order = [];
            channel.port2.addEventListener("message", function () { order.push(1); });
            channel.port2.onmessage = function () { order.push(2); };
            channel.port2.addEventListener("message", function () {
                order.push(3);
                expect(order).toEqual([1, 4, 3]);
                closeAll(channel.port1, channel.port2);
                done();
            });
            channel.port2.onmessage = function () { order.push(4); };
            channel.port1.postMessage(null);
        });
    });

    describe("close", function () {
        it("delivers a close event to the port being closed and to its sibling", function (done) {
            var channel = new MessageChannel();
            var seen = [];
            channel.port1.addEventListener("close", function () { seen.push("port1"); });
            channel.port2.addEventListener("close", function () { seen.push("port2"); });
            channel.port1.close();
            // The closing port learns synchronously; the sibling's close is
            // queued behind whatever it had already been sent.
            expect(seen).toEqual(["port1"]);
            setTimeout(function () {
                expect(seen).toEqual(["port1", "port2"]);
                closeAll(channel.port2);
                done();
            }, SETTLE);
        });

        it("dispatches an Event of type close", function () {
            var channel = new MessageChannel();
            var event = null;
            channel.port1.addEventListener("close", function (e) { event = e; });
            channel.port1.close();
            expect(event).not.toBeNull();
            expect(event.type).toBe("close");
            expect(event instanceof Event).toBe(true);
            expect(event.target).toBe(channel.port1);
            closeAll(channel.port2);
        });

        it("runs a close callback passed to close()", function () {
            var channel = new MessageChannel();
            var calls = 0;
            channel.port1.close(function () { calls++; });
            expect(calls).toBe(1);
            closeAll(channel.port2);
        });

        it("is idempotent", function () {
            var channel = new MessageChannel();
            var calls = 0;
            channel.port1.addEventListener("close", function () { calls++; });
            channel.port1.close();
            channel.port1.close();
            expect(calls).toBe(1);
            closeAll(channel.port2);
        });

        it("closes a never-started port when its sibling goes away", function (done) {
            var channel = new MessageChannel();
            var closed = false;
            channel.port2.addEventListener("close", function () { closed = true; });
            channel.port1.close();
            setTimeout(function () {
                expect(closed).toBe(true);
                done();
            }, SETTLE);
        });

        it("makes postMessage on a closed port a silent no-op", function (done) {
            var channel = new MessageChannel();
            var got = [];
            channel.port2.onmessage = function (event) { got.push(event.data); };
            channel.port1.close();
            expect(function () { channel.port1.postMessage("ignored"); }).not.toThrow();
            setTimeout(function () {
                expect(got).toEqual([]);
                closeAll(channel.port2);
                done();
            }, SETTLE);
        });

        it("still validates the transfer list on a closed port", function () {
            var channel = new MessageChannel();
            channel.port1.close();
            // Serialization runs before delivery is even attempted, so the
            // transfer list's errors do not depend on the port being open.
            expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [{}]);
            });
            closeAll(channel.port2);
        });
    });

    describe("transfer list validation", function () {
        it("rejects the source port", function () {
            var channel = new MessageChannel();
            var thrown = expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [channel.port1]);
            });
            expect(thrown.message).toContain("source port");
            closeAll(channel.port1, channel.port2);
        });

        it("rejects the same port listed twice", function () {
            var channel = new MessageChannel();
            var moved = new MessageChannel();
            var thrown = expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [moved.port1, moved.port1]);
            });
            expect(thrown.message).toContain("duplicate");
            closeAll(channel.port1, channel.port2, moved.port1, moved.port2);
        });

        it("rejects an already-closed port", function () {
            var channel = new MessageChannel();
            var moved = new MessageChannel();
            moved.port1.close();
            var thrown = expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [moved.port1]);
            });
            expect(thrown.message).toContain("detached");
            closeAll(channel.port1, channel.port2, moved.port2);
        });

        it("rejects a value that is neither an ArrayBuffer nor a port", function () {
            var channel = new MessageChannel();
            expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [{}]);
            });
            expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage(null, [7]);
            });
            closeAll(channel.port1, channel.port2);
        });

        it("rejects a non-iterable transfer argument", function () {
            var channel = new MessageChannel();
            expect(function () { channel.port1.postMessage(null, "nope"); })
                .toThrowError(TypeError);
            closeAll(channel.port1, channel.port2);
        });

        it("rejects a port that is in the message but not in the transfer list", function () {
            var channel = new MessageChannel();
            var stowaway = new MessageChannel();
            var thrown = expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage({ port: stowaway.port1 });
            });
            expect(thrown.message).toContain("transferList");
            closeAll(channel.port1, channel.port2, stowaway.port1, stowaway.port2);
        });

        // Nothing changes hands until the whole graph has serialized, so a
        // message that fails part-way leaves every listed port usable.
        it("leaves a listed port intact when the message fails to serialize", function (done) {
            var channel = new MessageChannel();
            var moved = new MessageChannel();
            expectThrowsNamed("DataCloneError", function () {
                channel.port1.postMessage({ bad: function () {} }, [moved.port1]);
            });
            moved.port2.onmessage = function (event) {
                expect(event.data).toBe("still alive");
                closeAll(channel.port1, channel.port2, moved.port1, moved.port2);
                done();
            };
            moved.port1.postMessage("still alive");
        });

        it("accepts the StructuredSerializeOptions form of the second argument", function (done) {
            var channel = new MessageChannel();
            var moved = new MessageChannel();
            channel.port2.onmessage = function (event) {
                expect(event.ports.length).toBe(1);
                closeAll(channel.port1, channel.port2, moved.port1, event.ports[0]);
                done();
            };
            channel.port1.postMessage({ port: moved.port2 }, { transfer: [moved.port2] });
        });
    });

    describe("port transfer", function () {
        it("hands a port over through another channel", function (done) {
            var outer = new MessageChannel();
            var inner = new MessageChannel();

            outer.port2.onmessage = function (event) {
                expect(event.ports.length).toBe(1);
                // The port in the graph and the port in `ports` are one object.
                expect(event.data.port).toBe(event.ports[0]);
                var adopted = event.ports[0];
                expect(adopted instanceof MessagePort).toBe(true);
                adopted.onmessage = function (inner_event) {
                    expect(inner_event.data).toBe("over the wire");
                    closeAll(outer.port1, outer.port2, inner.port1, adopted);
                    done();
                };
                inner.port1.postMessage("over the wire");
            };
            outer.port1.postMessage({ port: inner.port2 }, [inner.port2]);
        });

        // The queue travels with the port: what was posted before the handover
        // is still there for whoever adopts it.
        it("carries a queued backlog across the handover", function (done) {
            var outer = new MessageChannel();
            var inner = new MessageChannel();
            inner.port1.postMessage("backlog");

            outer.port2.onmessage = function (event) {
                var adopted = event.ports[0];
                var got = [];
                adopted.onmessage = function (inner_event) {
                    got.push(inner_event.data);
                    if (got.length === 2) {
                        expect(got).toEqual(["backlog", "after"]);
                        closeAll(outer.port1, outer.port2, inner.port1, adopted);
                        done();
                    }
                };
                inner.port1.postMessage("after");
            };
            outer.port1.postMessage({ port: inner.port2 }, [inner.port2]);
        });

        it("detaches the sender's port so posting on it is a no-op", function (done) {
            var outer = new MessageChannel();
            var inner = new MessageChannel();

            outer.port2.onmessage = function (event) {
                var adopted = event.ports[0];
                var got = [];
                adopted.onmessage = function (inner_event) { got.push(inner_event.data); };
                setTimeout(function () {
                    expect(got).toEqual([]);
                    closeAll(outer.port1, outer.port2, inner.port1, adopted);
                    done();
                }, SETTLE);
            };
            outer.port1.postMessage({ port: inner.port2 }, [inner.port2]);
            // Already handed over: the wrapper is still a MessagePort but it
            // owns nothing, so this goes nowhere rather than throwing.
            expect(function () { inner.port2.postMessage("lost"); }).not.toThrow();
        });

        it("transfers an ArrayBuffer alongside a port", function (done) {
            var channel = new MessageChannel();
            var moved = new MessageChannel();
            var buffer = new ArrayBuffer(4);
            new Uint8Array(buffer)[0] = 9;

            channel.port2.onmessage = function (event) {
                expect(event.data.buffer.byteLength).toBe(4);
                expect(new Uint8Array(event.data.buffer)[0]).toBe(9);
                expect(event.ports.length).toBe(1);
                closeAll(channel.port1, channel.port2, moved.port1, event.ports[0]);
                done();
            };
            channel.port1.postMessage(
                { buffer: buffer, port: moved.port2 },
                [buffer, moved.port2]
            );
            expect(buffer.byteLength).toBe(0);
        });

        it("moves a port through structuredClone in the same isolate", function (done) {
            var channel = new MessageChannel();
            var moved = structuredClone({ port: channel.port2 }, { transfer: [channel.port2] });
            expect(moved.port instanceof MessagePort).toBe(true);
            expect(moved.port).not.toBe(channel.port2);
            moved.port.onmessage = function (event) {
                expect(event.data).toBe("cloned across");
                closeAll(channel.port1, moved.port);
                done();
            };
            channel.port1.postMessage("cloned across");
        });

        it("rejects a detached port handed to structuredClone", function () {
            var channel = new MessageChannel();
            channel.port2.close();
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(channel.port2, { transfer: [channel.port2] });
            });
            closeAll(channel.port1);
        });

        it("rejects a port in a structuredClone graph that is not in the transfer list", function () {
            var channel = new MessageChannel();
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({ port: channel.port1 });
            });
            closeAll(channel.port1, channel.port2);
        });
    });

    describe("receiveMessageOnPort", function () {
        var workerThreads = null;
        try {
            workerThreads = require("node:worker_threads");
        } catch (e) {
            workerThreads = null;
        }

        if (workerThreads === null ||
            typeof workerThreads.receiveMessageOnPort !== "function") {
            it("is skipped: this runtime does not expose node:worker_threads", function () {
                pending();
            });
            return;
        }

        var receiveMessageOnPort = workerThreads.receiveMessageOnPort;

        it("returns undefined for an empty queue", function () {
            var channel = new MessageChannel();
            expect(receiveMessageOnPort(channel.port2)).toBeUndefined();
            closeAll(channel.port1, channel.port2);
        });

        it("drains one queued message at a time", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("a");
            channel.port1.postMessage("b");
            setTimeout(function () {
                expect(receiveMessageOnPort(channel.port2)).toEqual({ message: "a" });
                expect(receiveMessageOnPort(channel.port2)).toEqual({ message: "b" });
                expect(receiveMessageOnPort(channel.port2)).toBeUndefined();
                closeAll(channel.port1, channel.port2);
                done();
            }, TICK);
        });

        // Draining bypasses delivery entirely: a message taken this way never
        // reaches the port's listeners.
        it("takes the message out from under the event listeners", function (done) {
            var channel = new MessageChannel();
            var got = [];
            channel.port1.postMessage("drained");
            setTimeout(function () {
                expect(receiveMessageOnPort(channel.port2)).toEqual({ message: "drained" });
                channel.port2.onmessage = function (event) { got.push(event.data); };
                setTimeout(function () {
                    expect(got).toEqual([]);
                    closeAll(channel.port1, channel.port2);
                    done();
                }, SETTLE);
            }, TICK);
        });

        // The box is what says a message was there: without it a message whose
        // value is undefined would be indistinguishable from an empty queue.
        it("boxes a message whose value is undefined", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage(undefined);
            setTimeout(function () {
                var result = receiveMessageOnPort(channel.port2);
                expect(typeof result).toBe("object");
                expect(result).not.toBeUndefined();
                expect("message" in result).toBe(true);
                expect(result.message).toBeUndefined();
                closeAll(channel.port1, channel.port2);
                done();
            }, TICK);
        });

        it("drains a port that was never started", function (done) {
            var channel = new MessageChannel();
            channel.port1.postMessage("never started");
            setTimeout(function () {
                expect(receiveMessageOnPort(channel.port2)).toEqual({ message: "never started" });
                closeAll(channel.port1, channel.port2);
                done();
            }, TICK);
        });

        it("throws when handed something that is not a port", function () {
            expect(function () { receiveMessageOnPort({}); }).toThrowError(TypeError);
        });
    });
});
