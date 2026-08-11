/**
 * WHATWG Performance: hr-time (performance.now/timeOrigin), User Timing
 * (mark/measure), the Performance Timeline queries and PerformanceObserver,
 * plus the same surface inside Worker isolates.
 *
 * Two deliberate deviations from the specifications are asserted here:
 *   - `detail` is retained by reference instead of being structured-cloned, so
 *     a caller reads back the very object it passed in.
 *   - Observer callbacks are only guaranteed to run asynchronously; nothing
 *     pins them to a microtask or a macrotask turn.
 */

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

// The suite gates itself on the API being implemented so it can run from
// runAllTests() on every runtime: one that has not shipped the Performance API
// reports a single pending spec instead of failures. Runtimes that do ship it
// must keep an unguarded canary in their own test suite asserting the globals
// exist, so this gate cannot silently hide a regression there.
if (typeof globalObject.performance === "undefined" || typeof globalObject.PerformanceObserver !== "function") {
    describe("Performance API", function () {
        it("is skipped: this runtime does not implement the Performance API", function () {
            pending();
        });
    });
    return;
}

var PERFORMANCE_CONSTRUCTORS = [
    "Performance",
    "PerformanceEntry",
    "PerformanceMark",
    "PerformanceMeasure",
    "PerformanceObserver",
    "PerformanceObserverEntryList"
];

function captureThrown(fn) {
    try {
        fn();
    } catch (e) {
        return e;
    }
    return null;
}

function expectThrowsNamed(fn, name) {
    var thrown = captureThrown(fn);
    expect(thrown).not.toBeNull();
    expect(thrown && thrown.name).toBe(name);
    return thrown;
}

function expectThrowsTypeError(fn) {
    var thrown = expectThrowsNamed(fn, "TypeError");
    expect(thrown instanceof TypeError).toBe(true);
    return thrown;
}

function clearTimeline() {
    performance.clearMarks();
    performance.clearMeasures();
}

function entryNames(entries) {
    var names = [];
    for (var i = 0; i < entries.length; i++) {
        names.push(entries[i].name);
    }
    return names;
}

// A callback that throws is routed to reportError, which surfaces as a global
// `error` event. preventDefault() keeps it from reaching the runner's uncaught
// handler for the one test that exercises that path.
function suppressGlobalErrors() {
    if (typeof globalObject.addEventListener !== "function") {
        return function () {};
    }
    var listener = function (event) {
        if (event && typeof event.preventDefault === "function") {
            event.preventDefault();
        }
    };
    globalObject.addEventListener("error", listener);
    return function () {
        if (typeof globalObject.removeEventListener === "function") {
            globalObject.removeEventListener("error", listener);
        }
    };
}

describe("Performance globals", function () {
    beforeEach(clearTimeline);

    it("Should expose performance and every performance constructor", function () {
        expect(typeof performance).toBe("object");
        var types = [];
        for (var i = 0; i < PERFORMANCE_CONSTRUCTORS.length; i++) {
            types.push(PERFORMANCE_CONSTRUCTORS[i] + ": " + typeof globalObject[PERFORMANCE_CONSTRUCTORS[i]]);
        }
        expect(types).toEqual(PERFORMANCE_CONSTRUCTORS.map(function (name) {
            return name + ": function";
        }));
    });

    it("Should install them as own writable, enumerable, configurable properties", function () {
        var names = PERFORMANCE_CONSTRUCTORS.concat(["performance"]);
        var actual = names.map(function (name) {
            var descriptor = Object.getOwnPropertyDescriptor(globalObject, name);
            if (!descriptor) {
                return name + ": missing";
            }
            return name + ": " + [descriptor.writable, descriptor.enumerable, descriptor.configurable].join("/");
        });
        expect(actual).toEqual(names.map(function (name) {
            return name + ": true/true/true";
        }));
    });

    it("Should make Performance an EventTarget subclass", function () {
        expect(performance instanceof Performance).toBe(true);
        expect(performance instanceof EventTarget).toBe(true);
        expect(Object.getPrototypeOf(Performance.prototype)).toBe(EventTarget.prototype);
    });

    it("Should reject illegal constructors", function () {
        var illegal = [Performance, PerformanceEntry, PerformanceMeasure, PerformanceObserverEntryList];
        for (var i = 0; i < illegal.length; i++) {
            var thrown = expectThrowsTypeError((function (ctor) {
                return function () { new ctor(); };
            })(illegal[i]));
            expect(thrown && thrown.message).toContain("Illegal constructor");
        }
    });

    it("Should let PerformanceMark be constructed directly", function () {
        var mark = new PerformanceMark("constructed");
        expect(mark instanceof PerformanceMark).toBe(true);
        expect(mark instanceof PerformanceEntry).toBe(true);
        expect(mark.name).toBe("constructed");
        expect(mark.entryType).toBe("mark");
        expect(mark.duration).toBe(0);
    });

    it("Should brand instances with Symbol.toStringTag", function () {
        var mark = performance.mark("tagged");
        var measure = performance.measure("tagged", { start: 0, end: 1 });
        expect(Object.prototype.toString.call(performance)).toBe("[object Performance]");
        expect(Object.prototype.toString.call(mark)).toBe("[object PerformanceMark]");
        expect(Object.prototype.toString.call(measure)).toBe("[object PerformanceMeasure]");
    });

    it("Should keep Symbol.toStringTag configurable and non writable", function () {
        var prototypes = [Performance, PerformanceMark, PerformanceMeasure, PerformanceObserverEntryList];
        var actual = prototypes.map(function (ctor) {
            var descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, Symbol.toStringTag);
            if (!descriptor) {
                return "missing";
            }
            return descriptor.value + ": " + descriptor.writable + "/" + descriptor.configurable;
        });
        expect(actual).toEqual([
            "Performance: false/true",
            "PerformanceMark: false/true",
            "PerformanceMeasure: false/true",
            "PerformanceObserverEntryList: false/true"
        ]);
    });

    it("Should hide the EventTarget bookkeeping from Object.keys", function () {
        expect(Object.keys(performance).indexOf("_listeners")).toBe(-1);
    });

    it("Should inherit working EventTarget methods", function () {
        expect(typeof performance.addEventListener).toBe("function");
        expect(typeof performance.removeEventListener).toBe("function");
        expect(typeof performance.dispatchEvent).toBe("function");

        var received = null;
        var listener = function (event) { received = event; };
        performance.addEventListener("nstest", listener);
        performance.dispatchEvent(new Event("nstest"));
        performance.removeEventListener("nstest", listener);
        expect(received).not.toBeNull();
        expect(received && received.type).toBe("nstest");

        received = null;
        performance.dispatchEvent(new Event("nstest"));
        expect(received).toBeNull();
    });
});

describe("Performance high resolution time", function () {
    it("Should return a finite number of milliseconds that never goes backwards", function () {
        var previous = performance.now();
        expect(typeof previous).toBe("number");
        expect(isFinite(previous)).toBe(true);
        expect(previous).toBeGreaterThan(0);

        var regressions = 0;
        for (var i = 0; i < 200; i++) {
            var current = performance.now();
            if (current < previous) {
                regressions++;
            }
            previous = current;
        }
        expect(regressions).toBe(0);
    });

    it("Should not be coarsened to whole milliseconds", function () {
        var fractional = 0;
        for (var i = 0; i < 50; i++) {
            var sample = performance.now();
            if (sample !== Math.floor(sample)) {
                fractional++;
            }
        }
        expect(fractional).toBeGreaterThan(0);
    });

    it("Should expose timeOrigin as wall clock milliseconds since the epoch", function () {
        expect(typeof performance.timeOrigin).toBe("number");
        expect(performance.timeOrigin).toBeGreaterThan(0);
        expect(Math.abs(Date.now() - (performance.timeOrigin + performance.now()))).toBeLessThan(10);
    });

    it("Should keep timeOrigin a readonly accessor on the prototype", function () {
        var descriptor = Object.getOwnPropertyDescriptor(Performance.prototype, "timeOrigin");
        expect(descriptor).not.toBeUndefined();
        expect(typeof (descriptor && descriptor.get)).toBe("function");
        expect(descriptor && descriptor.set).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(performance, "timeOrigin")).toBe(false);

        var before = performance.timeOrigin;
        performance.timeOrigin = 0;
        expect(performance.timeOrigin).toBe(before);
        expect(Object.prototype.hasOwnProperty.call(performance, "timeOrigin")).toBe(false);
    });

    it("Should serialize to the time origin alone", function () {
        var json = performance.toJSON();
        expect(Object.keys(json)).toEqual(["timeOrigin"]);
        expect(json.timeOrigin).toBe(performance.timeOrigin);
    });
});

describe("Performance mark", function () {
    beforeEach(clearTimeline);

    it("Should return a buffered mark stamped with the current time", function () {
        var before = performance.now();
        var mark = performance.mark("m1");
        var after = performance.now();

        expect(mark instanceof PerformanceMark).toBe(true);
        expect(mark instanceof PerformanceEntry).toBe(true);
        expect(mark.name).toBe("m1");
        expect(mark.entryType).toBe("mark");
        expect(mark.duration).toBe(0);
        expect(mark.startTime >= before && mark.startTime <= after).toBe(true);
        expect(performance.getEntriesByName("m1")[0]).toBe(mark);
        expect(performance.getEntriesByType("mark")[0]).toBe(mark);
        expect(performance.getEntries().length).toBe(1);
    });

    it("Should honour an explicit startTime", function () {
        var mark = performance.mark("m2", { startTime: 12.5 });
        expect(mark.startTime).toBe(12.5);
        expect(performance.getEntriesByName("m2")[0].startTime).toBe(12.5);
    });

    it("Should default detail to null and keep a supplied detail by reference", function () {
        expect(performance.mark("m3").detail).toBeNull();

        var detail = { nested: {} };
        var mark = performance.mark("m4", { detail: detail });
        expect(mark.detail).toBe(detail);
        expect(mark.detail.nested).toBe(detail.nested);
        expect(performance.getEntriesByName("m4")[0].detail).toBe(detail);
    });

    it("Should reject a negative or non finite startTime", function () {
        var invalid = [-1, -0.5, NaN, Infinity, -Infinity];
        for (var i = 0; i < invalid.length; i++) {
            expectThrowsTypeError((function (startTime) {
                return function () { performance.mark("bad", { startTime: startTime }); };
            })(invalid[i]));
        }
        expect(performance.getEntries().length).toBe(0);
    });

    it("Should require a name", function () {
        expectThrowsTypeError(function () { performance.mark(); });
        expect(performance.getEntries().length).toBe(0);
    });

    it("Should not buffer marks built with the PerformanceMark constructor", function () {
        var detail = { standalone: true };
        var mark = new PerformanceMark("standalone", { startTime: 7, detail: detail });
        expect(mark.startTime).toBe(7);
        expect(mark.detail).toBe(detail);
        expect(performance.getEntriesByName("standalone")).toEqual([]);
        expect(performance.getEntries()).toEqual([]);
    });

    it("Should serialize the entry fields with toJSON", function () {
        var detail = { any: "value" };
        var mark = performance.mark("m5", { startTime: 3, detail: detail });
        var json = mark.toJSON();
        expect(json.name).toBe("m5");
        expect(json.entryType).toBe("mark");
        expect(json.startTime).toBe(3);
        expect(json.duration).toBe(0);
        expect(json.detail).toBe(detail);
    });
});

describe("Performance measure", function () {
    beforeEach(clearTimeline);

    it("Should span the time origin to now when given only a name", function () {
        var measure = performance.measure("m");
        expect(measure instanceof PerformanceMeasure).toBe(true);
        expect(measure instanceof PerformanceEntry).toBe(true);
        expect(measure.name).toBe("m");
        expect(measure.entryType).toBe("measure");
        expect(measure.startTime).toBe(0);
        expect(measure.duration).toBeGreaterThan(0);
        expect(measure.duration).not.toBeGreaterThan(performance.now());
        expect(measure.detail).toBeNull();
        expect(performance.getEntriesByName("m")[0]).toBe(measure);
    });

    it("Should span two marks", function () {
        var start = performance.mark("a", { startTime: 10 });
        var end = performance.mark("b", { startTime: 40 });
        var measure = performance.measure("ab", "a", "b");
        expect(measure.startTime).toBe(start.startTime);
        expect(measure.duration).toBe(end.startTime - start.startTime);
    });

    it("Should use the most recent mark of a repeated name", function () {
        performance.mark("dup", { startTime: 10 });
        performance.mark("dup", { startTime: 50 });
        performance.mark("end", { startTime: 80 });
        var measure = performance.measure("m", "dup", "end");
        expect(measure.startTime).toBe(50);
        expect(measure.duration).toBe(30);
    });

    it("Should measure up to now when only a start mark is given", function () {
        performance.mark("start", { startTime: 5 });
        var measure = performance.measure("m", "start");
        expect(measure.startTime).toBe(5);
        expect(measure.duration).toBeGreaterThan(0);
    });

    it("Should throw a SyntaxError named error for an unknown mark", function () {
        performance.mark("known", { startTime: 1 });
        expectThrowsNamed(function () { performance.measure("m", "missing"); }, "SyntaxError");
        expectThrowsNamed(function () { performance.measure("m", "known", "missing"); }, "SyntaxError");
        expectThrowsNamed(function () { performance.measure("m", { start: "missing" }); }, "SyntaxError");
        expect(performance.getEntriesByType("measure")).toEqual([]);
    });

    it("Should accept the numeric options form", function () {
        var startEnd = performance.measure("start-end", { start: 10, end: 40 });
        expect(startEnd.startTime).toBe(10);
        expect(startEnd.duration).toBe(30);

        var startDuration = performance.measure("start-duration", { start: 10, duration: 5 });
        expect(startDuration.startTime).toBe(10);
        expect(startDuration.duration).toBe(5);

        var durationEnd = performance.measure("duration-end", { duration: 5, end: 40 });
        expect(durationEnd.startTime).toBe(35);
        expect(durationEnd.duration).toBe(5);
    });

    it("Should fill in the missing endpoint when only start or only end is given", function () {
        var onlyStart = performance.measure("only-start", { start: 10 });
        expect(onlyStart.startTime).toBe(10);
        expect(onlyStart.duration).toBeGreaterThan(0);

        var onlyEnd = performance.measure("only-end", { end: 40 });
        expect(onlyEnd.startTime).toBe(0);
        expect(onlyEnd.duration).toBe(40);
    });

    it("Should accept mark names inside the options bag", function () {
        performance.mark("a", { startTime: 10 });
        performance.mark("b", { startTime: 40 });
        var measure = performance.measure("m", { start: "a", end: "b" });
        expect(measure.startTime).toBe(10);
        expect(measure.duration).toBe(30);
    });

    it("Should default detail to null and keep a supplied detail by reference", function () {
        var detail = { nested: {} };
        var measure = performance.measure("detailed", { start: 0, end: 1, detail: detail });
        expect(measure.detail).toBe(detail);
        expect(performance.getEntriesByName("detailed")[0].detail).toBe(detail);
        expect(performance.measure("plain", { start: 0, end: 1 }).detail).toBeNull();
    });

    it("Should treat an options bag without members like no options at all", function () {
        // The options branch of measure() only engages when start, end,
        // duration or detail is present; a bare {} is a boundless measure.
        var boundless = performance.measure("boundless", {});
        expect(boundless.startTime).toBe(0);
        expect(boundless.duration).toBeGreaterThan(0);
    });

    it("Should reject invalid option combinations", function () {
        expectThrowsTypeError(function () { performance.measure("m", { start: 1, end: 2, duration: 1 }); });
        expectThrowsTypeError(function () { performance.measure("m", { detail: { onlyDetail: true } }); });
        expectThrowsTypeError(function () { performance.measure("m", { start: 1 }, "someMark"); });
        expect(performance.getEntriesByType("measure")).toEqual([]);
    });

    it("Should reject negative or non finite numeric endpoints", function () {
        // duration is not converted through "convert a mark to a timestamp",
        // so a negative duration is legal (it yields an end before the start);
        // only non-finite values are rejected by the double conversion.
        var invalid = [
            { start: -1 },
            { end: -1 },
            { start: NaN },
            { end: Infinity },
            { start: 0, duration: NaN }
        ];
        for (var i = 0; i < invalid.length; i++) {
            expectThrowsTypeError((function (options) {
                return function () { performance.measure("m", options); };
            })(invalid[i]));
        }
        expect(performance.getEntriesByType("measure")).toEqual([]);
    });
});

describe("Performance timeline queries", function () {
    beforeEach(clearTimeline);

    it("Should return a fresh array from every query", function () {
        performance.mark("a");
        var first = performance.getEntries();
        var second = performance.getEntries();
        expect(first).not.toBe(second);
        expect(first).toEqual(second);

        first.length = 0;
        expect(performance.getEntries().length).toBe(1);
        expect(performance.getEntriesByType("mark")).not.toBe(performance.getEntriesByType("mark"));
        expect(performance.getEntriesByName("a")).not.toBe(performance.getEntriesByName("a"));
    });

    it("Should sort by startTime and keep insertion order for ties", function () {
        var late = performance.mark("late", { startTime: 30 });
        var early = performance.mark("early", { startTime: 10 });
        var tieFirst = performance.mark("tie-first", { startTime: 20 });
        var tieSecond = performance.mark("tie-second", { startTime: 20 });
        expect(performance.getEntries()).toEqual([early, tieFirst, tieSecond, late]);
    });

    it("Should place a measure that starts earlier ahead of already buffered marks", function () {
        var mark = performance.mark("later-mark", { startTime: 50 });
        var measure = performance.measure("earlier-measure", { start: 10, end: 20 });
        var entries = performance.getEntries();
        expect(entries.length).toBe(2);
        expect(entries[0]).toBe(measure);
        expect(entries[1]).toBe(mark);
    });

    it("Should filter by type and by name", function () {
        var mark = performance.mark("shared", { startTime: 10 });
        var measure = performance.measure("shared", { start: 0, end: 5 });
        performance.mark("other", { startTime: 1 });

        expect(entryNames(performance.getEntriesByType("mark"))).toEqual(["other", "shared"]);
        expect(performance.getEntriesByType("measure")).toEqual([measure]);
        expect(performance.getEntriesByType("navigation")).toEqual([]);
        expect(performance.getEntriesByName("shared")).toEqual([measure, mark]);
        expect(performance.getEntriesByName("shared", "mark")).toEqual([mark]);
        expect(performance.getEntriesByName("shared", "measure")).toEqual([measure]);
        expect(performance.getEntriesByName("nothing")).toEqual([]);
    });

    it("Should clear marks and measures independently", function () {
        performance.mark("a");
        performance.mark("b");
        performance.measure("m", { start: 0, end: 1 });

        performance.clearMarks();
        expect(performance.getEntriesByType("mark")).toEqual([]);
        expect(performance.getEntriesByType("measure").length).toBe(1);

        performance.clearMeasures();
        expect(performance.getEntries()).toEqual([]);
    });

    it("Should clear only the named entries of that type when a name is given", function () {
        performance.mark("keep", { startTime: 1 });
        performance.mark("drop", { startTime: 2 });
        performance.measure("keep", { start: 0, end: 1 });
        performance.measure("drop", { start: 0, end: 2 });

        performance.clearMarks("drop");
        expect(entryNames(performance.getEntriesByType("mark"))).toEqual(["keep"]);
        expect(entryNames(performance.getEntriesByType("measure"))).toEqual(["keep", "drop"]);

        performance.clearMeasures("drop");
        expect(entryNames(performance.getEntriesByType("measure"))).toEqual(["keep"]);
        expect(entryNames(performance.getEntriesByType("mark"))).toEqual(["keep"]);
    });
});

describe("PerformanceObserver", function () {
    var originalTimeout;
    var observers;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000;
        observers = [];
        clearTimeline();
    });

    afterEach(function () {
        for (var i = 0; i < observers.length; i++) {
            observers[i].disconnect();
        }
        observers = [];
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    function observing(callback) {
        var observer = new PerformanceObserver(callback);
        observers.push(observer);
        return observer;
    }

    it("Should require a callable callback", function () {
        expectThrowsTypeError(function () { new PerformanceObserver(); });
        expectThrowsTypeError(function () { new PerformanceObserver(null); });
        expectThrowsTypeError(function () { new PerformanceObserver({}); });
        expectThrowsTypeError(function () { new PerformanceObserver("mark"); });
    });

    it("Should advertise the supported entry types as a frozen list", function () {
        expect(PerformanceObserver.supportedEntryTypes).toEqual(["mark", "measure"]);
        expect(Object.isFrozen(PerformanceObserver.supportedEntryTypes)).toBe(true);
    });

    it("Should reject malformed observe options", function () {
        var observer = observing(function () {});
        expectThrowsTypeError(function () { observer.observe({ entryTypes: ["mark"], type: "mark" }); });
        expectThrowsTypeError(function () { observer.observe({ entryTypes: ["mark"], buffered: true }); });
        expectThrowsTypeError(function () { observer.observe({}); });
        expectThrowsTypeError(function () { observer.observe(); });
    });

    it("Should convert entryTypes as a WebIDL sequence", function (done) {
        // Non-iterables (and string primitives, which fail the object check)
        // must throw rather than silently observe nothing.
        var observer = observing(function () {});
        expectThrowsTypeError(function () { observer.observe({ entryTypes: 5 }); });
        expectThrowsTypeError(function () { observer.observe({ entryTypes: "mark" }); });
        expectThrowsTypeError(function () { observer.observe({ entryTypes: { length: 1, 0: "mark" } }); });

        // Any iterable converts, not just arrays.
        var fromSet = observing(function (list) {
            expect(entryNames(list.getEntries())).toEqual(["set-observed"]);
            done();
        });
        fromSet.observe({ entryTypes: new Set(["mark"]) });
        performance.mark("set-observed");
    });

    it("Should refuse to switch an observer between the entryTypes and type forms", function () {
        var byList = observing(function () {});
        byList.observe({ entryTypes: ["mark"] });
        expectThrowsNamed(function () { byList.observe({ type: "measure" }); }, "InvalidModificationError");

        var bySingle = observing(function () {});
        bySingle.observe({ type: "mark" });
        expectThrowsNamed(function () { bySingle.observe({ entryTypes: ["measure"] }); }, "InvalidModificationError");
    });

    it("Should deliver entries asynchronously, after mark() has returned", function (done) {
        var markReturned = false;
        var observer = observing(function (list, self) {
            expect(markReturned).toBe(true);
            expect(this).toBe(observer);
            expect(self).toBe(observer);
            expect(list instanceof PerformanceObserverEntryList).toBe(true);
            expect(Object.prototype.toString.call(list)).toBe("[object PerformanceObserverEntryList]");

            var entries = list.getEntries();
            expect(entries.length).toBe(1);
            expect(entries[0].name).toBe("async");
            expect(entries[0].entryType).toBe("mark");
            expect(entryNames(list.getEntriesByType("mark"))).toEqual(["async"]);
            expect(list.getEntriesByType("measure")).toEqual([]);
            expect(entryNames(list.getEntriesByName("async"))).toEqual(["async"]);
            expect(list.getEntriesByName("async", "mark").length).toBe(1);
            expect(list.getEntriesByName("async", "measure")).toEqual([]);
            expect(list.getEntriesByName("nothing")).toEqual([]);
            done();
        });

        observer.observe({ entryTypes: ["mark"] });
        performance.mark("async");
        markReturned = true;
    });

    it("Should observe a single entry type with the type form", function (done) {
        var finished = false;
        var observer = observing(function (list) {
            if (finished) {
                return;
            }
            finished = true;
            var entries = list.getEntries();
            expect(entries.length).toBe(1);
            expect(entries[0].name).toBe("only-measure");
            expect(entries[0].entryType).toBe("measure");
            done();
        });

        observer.observe({ type: "measure" });
        performance.mark("ignored");
        performance.measure("only-measure", { start: 0, end: 1 });
    });

    it("Should replay already buffered entries when buffered is true", function (done) {
        performance.mark("before-observe", { startTime: 1 });
        var observer = observing(function (list) {
            expect(entryNames(list.getEntries())).toContain("before-observe");
            done();
        });

        observer.observe({ type: "mark", buffered: true });
    });

    it("Should ignore unsupported entry types and keep the supported ones", function (done) {
        var observer = observing(function (list) {
            expect(entryNames(list.getEntries())).toEqual(["filtered"]);
            done();
        });

        observer.observe({ entryTypes: ["mark", "resource", "navigation"] });
        performance.mark("filtered");
    });

    it("Should stay silent when every requested entry type is unsupported", function (done) {
        var calls = 0;
        var observer = observing(function () { calls++; });

        observer.observe({ entryTypes: ["resource", "navigation"] });
        performance.mark("unobserved");
        performance.measure("unobserved", { start: 0, end: 1 });

        setTimeout(function () {
            expect(calls).toBe(0);
            done();
        }, 500);
    });

    it("Should drain pending entries synchronously with takeRecords", function (done) {
        var calls = 0;
        var observer = observing(function () { calls++; });
        observer.observe({ entryTypes: ["mark"] });
        performance.mark("taken");

        var records = observer.takeRecords();
        expect(records.length).toBe(1);
        expect(records[0].name).toBe("taken");
        expect(observer.takeRecords()).toEqual([]);

        setTimeout(function () {
            expect(calls).toBe(0);
            done();
        }, 500);
    });

    it("Should stop delivering after disconnect", function (done) {
        var calls = 0;
        var observer = observing(function () { calls++; });
        observer.observe({ entryTypes: ["mark", "measure"] });
        observer.disconnect();

        performance.mark("after-disconnect");
        performance.measure("after-disconnect", { start: 0, end: 1 });

        setTimeout(function () {
            expect(calls).toBe(0);
            expect(observer.takeRecords()).toEqual([]);
            done();
        }, 500);
    });

    it("Should run every observer in registration order even when one throws", function (done) {
        var order = [];
        var restoreErrorHandling = suppressGlobalErrors();

        observing(function () { order.push("first"); }).observe({ entryTypes: ["mark"] });
        observing(function () {
            order.push("second");
            throw new Error("observer callback failure");
        }).observe({ entryTypes: ["mark"] });
        observing(function () { order.push("third"); }).observe({ entryTypes: ["mark"] });

        performance.mark("fan-out");

        setTimeout(function () {
            expect(order).toEqual(["first", "second", "third"]);
            restoreErrorHandling();
            done();
        }, 500);
    });
});

describe("Performance in workers", function () {
    // Worker paths are resolved against the requiring module's directory.
    var EVAL_WORKER = "../Workers/EvalWorker.js";
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000;
        clearTimeline();
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    it("Should expose the same performance surface", function (done) {
        var worker = new Worker(EVAL_WORKER);

        worker.postMessage({
            eval: "postMessage({" +
                "performance: typeof performance," +
                "now: typeof performance.now()," +
                "timeOrigin: typeof performance.timeOrigin," +
                "isPerformance: performance instanceof Performance," +
                "isEventTarget: performance instanceof EventTarget," +
                "tag: Object.prototype.toString.call(performance)," +
                "mark: typeof performance.mark," +
                "measure: typeof performance.measure," +
                "getEntries: typeof performance.getEntries," +
                "clearMarks: typeof performance.clearMarks," +
                "observer: typeof PerformanceObserver," +
                "entry: typeof PerformanceEntry," +
                "markCtor: typeof PerformanceMark," +
                "measureCtor: typeof PerformanceMeasure," +
                "entryList: typeof PerformanceObserverEntryList" +
            "});"
        });

        worker.onmessage = function (msg) {
            expect(msg.data.performance).toBe("object");
            expect(msg.data.now).toBe("number");
            expect(msg.data.timeOrigin).toBe("number");
            expect(msg.data.isPerformance).toBe(true);
            expect(msg.data.isEventTarget).toBe(true);
            expect(msg.data.tag).toBe("[object Performance]");
            expect(msg.data.mark).toBe("function");
            expect(msg.data.measure).toBe("function");
            expect(msg.data.getEntries).toBe("function");
            expect(msg.data.clearMarks).toBe("function");
            expect(msg.data.observer).toBe("function");
            expect(msg.data.entry).toBe("function");
            expect(msg.data.markCtor).toBe("function");
            expect(msg.data.measureCtor).toBe("function");
            expect(msg.data.entryList).toBe("function");
            worker.terminate();
            done();
        };
    });

    it("Should capture its own time origin when the worker thread starts", function (done) {
        var mainTimeOrigin = performance.timeOrigin;
        var mainNowBeforeWorker = performance.now();
        var worker = new Worker(EVAL_WORKER);

        worker.postMessage({
            eval: "postMessage({ timeOrigin: performance.timeOrigin, now: performance.now(), date: Date.now() });"
        });

        worker.onmessage = function (msg) {
            var mainDate = Date.now();
            expect(msg.data.timeOrigin).not.toBeLessThan(mainTimeOrigin);
            // The worker clock only starts running with its thread, so the time it
            // has accumulated stays below what the main isolate had already logged
            // before the worker existed.
            expect(msg.data.now).toBeLessThan(mainNowBeforeWorker);
            expect(Math.abs(msg.data.date - (msg.data.timeOrigin + msg.data.now))).toBeLessThan(10);
            expect(Math.abs(mainDate - (msg.data.timeOrigin + msg.data.now))).toBeLessThan(500);
            worker.terminate();
            done();
        };
    });

    it("Should keep a timeline buffer independent from the main isolate", function (done) {
        performance.mark("main-only");
        expect(entryNames(performance.getEntries())).toEqual(["main-only"]);

        var worker = new Worker(EVAL_WORKER);

        worker.postMessage({
            eval: "var initial = performance.getEntries().length;" +
                "performance.mark('worker-only');" +
                "postMessage({ initial: initial, names: performance.getEntries().map(function (entry) { return entry.name; }) });"
        });

        worker.onmessage = function (msg) {
            expect(msg.data.initial).toBe(0);
            expect(msg.data.names).toEqual(["worker-only"]);
            expect(entryNames(performance.getEntries())).toEqual(["main-only"]);
            worker.terminate();
            done();
        };
    });
});
