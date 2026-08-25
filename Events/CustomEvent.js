// Suite for the CustomEvent interface (DOM Standard §2.4).
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// CustomEvent does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the global is there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// Nothing here asserts constructor arity or missing-argument TypeErrors:
// runtimes differ on how strictly the base Event enforces them, and this
// suite pins CustomEvent's own contract, not Event's.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.CustomEvent === "undefined" || typeof globalObject.Event === "undefined") {
    describe("CustomEvent", function () {
        it("is skipped: this runtime does not implement CustomEvent", function () {
            pending();
        });
    });
    return;
}

var CustomEvent = globalObject.CustomEvent;
var Event = globalObject.Event;

describe("CustomEvent", function () {
    it("constructs an Event of the given type", function () {
        var e = new CustomEvent("build");
        expect(e.type).toBe("build");
        expect(e instanceof CustomEvent).toBe(true);
        expect(e instanceof Event).toBe(true);
    });

    it("chains its prototype onto Event.prototype", function () {
        expect(Object.getPrototypeOf(CustomEvent.prototype)).toBe(Event.prototype);
        expect(CustomEvent.prototype.constructor).toBe(CustomEvent);
    });

    it("defaults detail to null", function () {
        expect(new CustomEvent("a").detail).toBe(null);
        expect(new CustomEvent("a", {}).detail).toBe(null);
        expect(new CustomEvent("a", { bubbles: true }).detail).toBe(null);
    });

    it("carries detail through by identity", function () {
        var payload = { answer: 42 };
        expect(new CustomEvent("a", { detail: payload }).detail).toBe(payload);
    });

    it("preserves falsy detail values", function () {
        expect(new CustomEvent("a", { detail: 0 }).detail).toBe(0);
        expect(new CustomEvent("a", { detail: "" }).detail).toBe("");
        expect(new CustomEvent("a", { detail: false }).detail).toBe(false);
        expect(new CustomEvent("a", { detail: null }).detail).toBe(null);
    });

    it("honors the Event init flags", function () {
        var e = new CustomEvent("a", { bubbles: true, cancelable: true, detail: 1 });
        expect(e.bubbles).toBe(true);
        expect(e.cancelable).toBe(true);
    });

    it("supports preventDefault when cancelable", function () {
        var e = new CustomEvent("a", { cancelable: true });
        expect(e.defaultPrevented).toBe(false);
        e.preventDefault();
        expect(e.defaultPrevented).toBe(true);
    });

    if (typeof globalObject.EventTarget === "function") {
        it("dispatches through an EventTarget with detail intact", function () {
            var target = new globalObject.EventTarget();
            var payload = { hello: "world" };
            var seen = null;
            target.addEventListener("custom", function (event) {
                seen = event;
            });
            target.dispatchEvent(new CustomEvent("custom", { detail: payload }));
            expect(seen).not.toBeNull();
            expect(seen instanceof CustomEvent).toBe(true);
            expect(seen.detail).toBe(payload);
        });
    }
});
