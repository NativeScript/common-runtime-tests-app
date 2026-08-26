// Suite for the MessageEvent interface (HTML Standard §9.2.5).
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// MessageEvent does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the global is there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// `type`, `bubbles` and `cancelable` are the base Event's, and runtimes differ
// on whether those are accessors or plain writable fields, so nothing here
// asserts read-only-ness on them — only the values MessageEvent puts there.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.MessageEvent === "undefined" || typeof globalObject.Event === "undefined") {
    describe("MessageEvent", function () {
        it("is skipped: this runtime does not implement MessageEvent", function () {
            pending();
        });
    });
    return;
}

var MessageEvent = globalObject.MessageEvent;
var Event = globalObject.Event;

// The dispatch-dependent specs — including the one pinning that
// initMessageEvent is inert mid-dispatch — need a target to dispatch on.
var hasEventTarget = typeof globalObject.EventTarget === "function";
var itWithTarget = hasEventTarget ? it : xit;

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
    describe("constructor", function () {
        it("requires the type argument", function () {
            expectThrowsTypeError(function () { new MessageEvent(); });
        });

        it("constructs an Event of the given type", function () {
            var e = new MessageEvent("message");
            expect(e.type).toBe("message");
            expect(e.bubbles).toBe(false);
            expect(e.cancelable).toBe(false);
            expect(e.defaultPrevented).toBe(false);
        });

        it("applies the spec defaults with no init, an undefined init and a null init", function () {
            [new MessageEvent("m"), new MessageEvent("m", undefined), new MessageEvent("m", null), new MessageEvent("m", {})]
                .forEach(function (e) {
                    expect(e.data).toBe(null);
                    expect(e.origin).toBe("");
                    expect(e.lastEventId).toBe("");
                    expect(e.source).toBe(null);
                    expect(e.ports).toEqual([]);
                });
        });

        it("rejects a non-null primitive init", function () {
            expectThrowsTypeError(function () { new MessageEvent("m", 5); });
            expectThrowsTypeError(function () { new MessageEvent("m", "init"); });
            expectThrowsTypeError(function () { new MessageEvent("m", true); });
        });

        it("carries data through by identity", function () {
            var payload = { answer: 42 };
            expect(new MessageEvent("m", { data: payload }).data).toBe(payload);
        });

        it("preserves falsy data values but treats an explicit undefined as null", function () {
            expect(new MessageEvent("m", { data: 0 }).data).toBe(0);
            expect(new MessageEvent("m", { data: "" }).data).toBe("");
            expect(new MessageEvent("m", { data: false }).data).toBe(false);
            expect(new MessageEvent("m", { data: null }).data).toBe(null);
            expect(new MessageEvent("m", { data: undefined }).data).toBe(null);
        });

        it("stringifies origin and lastEventId", function () {
            var e = new MessageEvent("m", { origin: 42, lastEventId: null });
            expect(e.origin).toBe("42");
            expect(e.lastEventId).toBe("null");
            expect(new MessageEvent("m", { origin: "https://example.com", lastEventId: "7" }).origin)
                .toBe("https://example.com");
        });

        it("carries source through by identity", function () {
            var source = { window: true };
            expect(new MessageEvent("m", { source: source }).source).toBe(source);
            expect(new MessageEvent("m", { source: null }).source).toBe(null);
        });

        it("honors the Event init flags", function () {
            var e = new MessageEvent("m", { bubbles: true, cancelable: true, data: 1 });
            expect(e.bubbles).toBe(true);
            expect(e.cancelable).toBe(true);
            e.preventDefault();
            expect(e.defaultPrevented).toBe(true);
        });
    });

    describe("ports", function () {
        it("accepts an array", function () {
            var e = new MessageEvent("m", { ports: ["a", "b"] });
            expect(e.ports).toEqual(["a", "b"]);
        });

        // A frozen copy per read, rather than the one frozen array browsers hand
        // back: the event's own list can never be reached through a caller's
        // reference.
        it("returns a frozen copy on every read", function () {
            var e = new MessageEvent("m", { ports: ["a"] });
            expect(Object.isFrozen(e.ports)).toBe(true);
            expect(e.ports).not.toBe(e.ports);
            expect(e.ports).toEqual(e.ports);
        });

        it("does not alias the array passed to the constructor", function () {
            var ports = ["a"];
            var e = new MessageEvent("m", { ports: ports });
            ports.push("b");
            expect(e.ports).toEqual(["a"]);
        });

        it("accepts any iterable", function () {
            expect(new MessageEvent("m", { ports: new Set(["a", "b"]) }).ports).toEqual(["a", "b"]);
            var iterable = {};
            iterable[Symbol.iterator] = function () {
                var i = 0;
                return { next: function () { return i < 2 ? { done: false, value: i++ } : { done: true }; } };
            };
            expect(new MessageEvent("m", { ports: iterable }).ports).toEqual([0, 1]);
        });

        it("does not type-check the entries", function () {
            expect(new MessageEvent("m", { ports: [1, "two", null] }).ports).toEqual([1, "two", null]);
        });

        it("treats null as an empty sequence", function () {
            expect(new MessageEvent("m", { ports: null }).ports).toEqual([]);
        });

        // Primitives are rejected before iteration, so an iterable string is a
        // TypeError here rather than the sequence of its characters.
        it("rejects a non-iterable value", function () {
            expectThrowsTypeError(function () { new MessageEvent("m", { ports: {} }); });
            expectThrowsTypeError(function () { new MessageEvent("m", { ports: 5 }); });
            expectThrowsTypeError(function () { new MessageEvent("m", { ports: "ab" }); });
            expectThrowsTypeError(function () { new MessageEvent("m", { ports: function () {} }); });
        });
    });

    describe("initMessageEvent", function () {
        it("requires the type argument", function () {
            expectThrowsTypeError(function () { new MessageEvent("m").initMessageEvent(); });
        });

        it("mutates the event in place and returns undefined", function () {
            var e = new MessageEvent("m", { data: "old" });
            var source = { window: true };
            var result = e.initMessageEvent("changed", true, true, "new", 42, 7, source, ["p"]);
            expect(result).toBeUndefined();
            expect(e.type).toBe("changed");
            expect(e.bubbles).toBe(true);
            expect(e.cancelable).toBe(true);
            expect(e.data).toBe("new");
            expect(e.origin).toBe("42");
            expect(e.lastEventId).toBe("7");
            expect(e.source).toBe(source);
            expect(e.ports).toEqual(["p"]);
        });

        it("applies its own defaults to the omitted arguments", function () {
            var e = new MessageEvent("m", {
                bubbles: true,
                cancelable: true,
                data: "old",
                origin: "o",
                lastEventId: "1",
                source: {},
                ports: ["p"]
            });
            e.initMessageEvent("changed");
            expect(e.type).toBe("changed");
            expect(e.bubbles).toBe(false);
            expect(e.cancelable).toBe(false);
            expect(e.data).toBe(null);
            expect(e.origin).toBe("");
            expect(e.lastEventId).toBe("");
            expect(e.source).toBe(null);
            expect(e.ports).toEqual([]);
        });

        it("stringifies the type and coerces the flags", function () {
            var e = new MessageEvent("m");
            e.initMessageEvent(42, 1, "yes");
            expect(e.type).toBe("42");
            expect(e.bubbles).toBe(true);
            expect(e.cancelable).toBe(true);
        });

        itWithTarget("clears defaultPrevented and target", function () {
            var target = new globalObject.EventTarget();
            var e = new MessageEvent("m", { cancelable: true });
            target.dispatchEvent(e);
            e.preventDefault();
            expect(e.target).toBe(target);
            expect(e.defaultPrevented).toBe(true);
            e.initMessageEvent("m");
            expect(e.target).toBe(null);
            expect(e.defaultPrevented).toBe(false);
        });

        it("treats null ports as an empty sequence", function () {
            var e = new MessageEvent("m", { ports: ["p"] });
            e.initMessageEvent("m", false, false, null, "", "", null, null);
            expect(e.ports).toEqual([]);
        });

        itWithTarget("is a no-op while the event is being dispatched", function () {
            var target = new globalObject.EventTarget();
            var e = new MessageEvent("message", { data: "original" });
            var listenerRan = false;
            target.addEventListener("message", function (event) {
                listenerRan = true;
                event.initMessageEvent("changed", true, true, "replaced", "o", "1");
            });
            target.dispatchEvent(e);
            expect(listenerRan).toBe(true);
            expect(e.type).toBe("message");
            expect(e.data).toBe("original");
            expect(e.origin).toBe("");
            expect(e.bubbles).toBe(false);
        });
    });

    describe("interface", function () {
        it("extends Event", function () {
            var e = new MessageEvent("m");
            expect(e instanceof MessageEvent).toBe(true);
            expect(e instanceof Event).toBe(true);
            expect(Object.getPrototypeOf(MessageEvent.prototype)).toBe(Event.prototype);
            expect(MessageEvent.prototype.constructor).toBe(MessageEvent);
        });

        it("is named MessageEvent with one required argument", function () {
            expect(MessageEvent.name).toBe("MessageEvent");
            expect(MessageEvent.length).toBe(1);
            expect(MessageEvent.prototype.initMessageEvent.length).toBe(1);
        });

        it("brands via Symbol.toStringTag", function () {
            expect(MessageEvent.prototype[Symbol.toStringTag]).toBe("MessageEvent");
            expect(Object.prototype.toString.call(new MessageEvent("m"))).toBe("[object MessageEvent]");
        });

        // Class syntax makes members non-enumerable; the IDL says otherwise.
        it("exposes the IDL members as enumerable prototype properties", function () {
            ["data", "origin", "lastEventId", "source", "ports", "initMessageEvent"].forEach(function (key) {
                var desc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, key);
                expect(desc).toBeDefined();
                expect(desc && desc.enumerable).toBe(true);
            });
        });

        it("keeps the readonly attributes accessor-only", function () {
            ["data", "origin", "lastEventId", "source", "ports"].forEach(function (key) {
                var desc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, key);
                expect(typeof desc.get).toBe("function");
                expect(desc.set).toBeUndefined();
            });
        });

        itWithTarget("dispatches through an EventTarget with data intact", function () {
            var target = new globalObject.EventTarget();
            var payload = { hello: "world" };
            var seen = null;
            target.addEventListener("message", function (event) {
                seen = event;
            });
            target.dispatchEvent(new MessageEvent("message", { data: payload, origin: "here" }));
            expect(seen).not.toBeNull();
            expect(seen instanceof MessageEvent).toBe(true);
            expect(seen.data).toBe(payload);
            expect(seen.origin).toBe("here");
        });
    });
});
