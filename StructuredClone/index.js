// Suite for the WHATWG structuredClone() global. Opt-in per runtime
// (runStructuredCloneTests), because not every runtime exposes the API yet.
//
// Clone failures are asserted by `.name === "DataCloneError"` rather than by
// `instanceof DOMException`: runtimes without a DOMException throw a plain
// Error carrying that name.

// The V8-based iOS runtime (@nativescript/ios); the legacy JSC runtime exposes TNSRuntime
var isV8iOS = !!global.NSObject && !global.TNSRuntime;

function expectThrowsNamed(name, fn) {
    var thrown = null;
    try {
        fn();
    } catch (e) {
        thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(thrown && thrown.name).toBe(name);
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
    it("is a function on the global", function () {
        expect(typeof structuredClone).toBe("function");
        expect(structuredClone.length).toBe(1);
        expect(structuredClone.name).toBe("structuredClone");
    });

    describe("primitives", function () {
        it("round-trips numbers, including the special values", function () {
            expect(structuredClone(0)).toBe(0);
            expect(structuredClone(42)).toBe(42);
            expect(structuredClone(-1.5)).toBe(-1.5);
            expect(Object.is(structuredClone(-0), -0)).toBe(true);
            expect(isNaN(structuredClone(NaN))).toBe(true);
            expect(structuredClone(Infinity)).toBe(Infinity);
            expect(structuredClone(-Infinity)).toBe(-Infinity);
        });

        it("round-trips strings, booleans, null and undefined", function () {
            expect(structuredClone("")).toBe("");
            expect(structuredClone("héllo \u{1F600}")).toBe("héllo \u{1F600}");
            expect(structuredClone(true)).toBe(true);
            expect(structuredClone(false)).toBe(false);
            expect(structuredClone(null)).toBeNull();
            expect(structuredClone(undefined)).toBeUndefined();
        });

        it("round-trips BigInt", function () {
            var big = BigInt("9007199254740993");
            var cloned = structuredClone(big);
            expect(typeof cloned).toBe("bigint");
            expect(cloned === big).toBe(true);
            expect(structuredClone(BigInt(-7)) === BigInt(-7)).toBe(true);
        });
    });

    describe("plain objects and arrays", function () {
        it("clones a deeply nested structure by value", function () {
            var source = { a: 1, b: { c: [1, 2, { d: "deep" }], e: null }, f: [[["nested"]]] };
            var cloned = structuredClone(source);

            expect(cloned).not.toBe(source);
            expect(cloned.b).not.toBe(source.b);
            expect(cloned.b.c[2]).not.toBe(source.b.c[2]);
            expect(cloned.b.c[2].d).toBe("deep");
            expect(cloned.f[0][0][0]).toBe("nested");
        });

        it("preserves property order", function () {
            var source = { z: 1, a: 2, m: 3, "0": 4 };
            expect(Object.keys(structuredClone(source)).join(",")).toBe(Object.keys(source).join(","));
        });

        it("clones arrays, including holes and extra properties", function () {
            var source = [1, , 3];
            source.extra = "x";
            var cloned = structuredClone(source);

            expect(Array.isArray(cloned)).toBe(true);
            expect(cloned.length).toBe(3);
            expect(cloned.hasOwnProperty(1)).toBe(false);
            expect(cloned.extra).toBe("x");
        });

        it("is deep: mutating either side does not affect the other", function () {
            var source = { list: [1, 2, 3], nested: { n: 1 } };
            var cloned = structuredClone(source);

            cloned.list.push(4);
            cloned.nested.n = 99;
            expect(source.list.length).toBe(3);
            expect(source.nested.n).toBe(1);

            source.nested.n = 7;
            expect(cloned.nested.n).toBe(99);
        });

        it("drops the prototype of a class instance", function () {
            function Thing(v) {
                this.v = v;
            }
            Thing.prototype.method = function () { };

            var cloned = structuredClone(new Thing(5));
            expect(cloned.v).toBe(5);
            expect(cloned instanceof Thing).toBe(false);
            expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
        });

        it("invokes getters and stores their value as a data property", function () {
            var calls = 0;
            var source = {
                get computed() {
                    calls++;
                    return { inner: 1 };
                }
            };

            var cloned = structuredClone(source);
            expect(calls).toBe(1);
            expect(cloned.computed.inner).toBe(1);
            expect(Object.getOwnPropertyDescriptor(cloned, "computed").get).toBeUndefined();
        });
    });

    describe("built-in object types", function () {
        it("clones Date", function () {
            var source = new Date(1234567890123);
            var cloned = structuredClone(source);

            expect(cloned instanceof Date).toBe(true);
            expect(cloned).not.toBe(source);
            expect(cloned.getTime()).toBe(source.getTime());
        });

        it("clones RegExp with its flags and source", function () {
            var source = /a(b)c/gimy;
            var cloned = structuredClone(source);

            expect(cloned instanceof RegExp).toBe(true);
            expect(cloned.source).toBe("a(b)c");
            expect(cloned.flags).toBe(source.flags);
            expect(cloned.test("abc")).toBe(true);
        });

        it("clones Map, keeping entry order and cloning keys and values", function () {
            var key = { k: 1 };
            var source = new Map();
            source.set("first", 1);
            source.set(key, { v: 2 });
            source.set(3, "third");

            var cloned = structuredClone(source);
            expect(cloned instanceof Map).toBe(true);
            expect(cloned.size).toBe(3);
            expect(cloned.get("first")).toBe(1);
            expect(cloned.get(3)).toBe("third");
            expect(cloned.get(key)).toBeUndefined();

            var keys = [];
            cloned.forEach(function (value, k) { keys.push(k); });
            expect(keys[0]).toBe("first");
            expect(typeof keys[1]).toBe("object");
            expect(keys[1].k).toBe(1);
            expect(keys[2]).toBe(3);
        });

        it("clones Set, keeping insertion order", function () {
            var source = new Set(["a", 2, "a"]);
            var cloned = structuredClone(source);

            expect(cloned instanceof Set).toBe(true);
            expect(cloned.size).toBe(2);
            expect(cloned.has("a")).toBe(true);
            expect(cloned.has(2)).toBe(true);

            var values = [];
            cloned.forEach(function (v) { values.push(v); });
            expect(values.join(",")).toBe("a,2");
        });

        it("clones Boolean, String and Number wrapper objects", function () {
            var boolean = structuredClone(new Boolean(true));
            expect(typeof boolean).toBe("object");
            expect(boolean instanceof Boolean).toBe(true);
            expect(boolean.valueOf()).toBe(true);

            var string = structuredClone(new String("wrapped"));
            expect(string instanceof String).toBe(true);
            expect(string.valueOf()).toBe("wrapped");

            var number = structuredClone(new Number(7.5));
            expect(number instanceof Number).toBe(true);
            expect(number.valueOf()).toBe(7.5);
        });

        it("clones Error, preserving name and message", function () {
            var source = new TypeError("boom");
            var cloned = structuredClone(source);

            expect(cloned instanceof Error).toBe(true);
            expect(cloned).not.toBe(source);
            expect(cloned.name).toBe("TypeError");
            expect(cloned.message).toBe("boom");

            var plain = structuredClone(new Error("plain"));
            expect(plain.name).toBe("Error");
            expect(plain.message).toBe("plain");
        });
    });

    describe("binary data", function () {
        it("copies an ArrayBuffer without detaching the source", function () {
            var source = new ArrayBuffer(4);
            new Uint8Array(source).set([1, 2, 3, 4]);

            var cloned = structuredClone(source);
            expect(cloned instanceof ArrayBuffer).toBe(true);
            expect(cloned).not.toBe(source);
            expect(cloned.byteLength).toBe(4);
            expect(source.byteLength).toBe(4);

            var clonedBytes = new Uint8Array(cloned);
            expect(clonedBytes[0]).toBe(1);
            expect(clonedBytes[3]).toBe(4);

            clonedBytes[0] = 42;
            expect(new Uint8Array(source)[0]).toBe(1);
        });

        it("clones typed arrays of every element type", function () {
            var constructors = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
                Int32Array, Uint32Array, Float32Array, Float64Array];

            for (var i = 0; i < constructors.length; i++) {
                var Ctor = constructors[i];
                var source = new Ctor([1, 2, 3]);
                var cloned = structuredClone(source);

                expect(cloned instanceof Ctor).toBe(true);
                expect(cloned.length).toBe(3);
                expect(cloned[0]).toBe(1);
                expect(cloned[2]).toBe(3);
            }
        });

        it("preserves a typed array's byteOffset and length", function () {
            var buffer = new ArrayBuffer(16);
            new Uint8Array(buffer).set([0, 0, 0, 0, 9, 8, 7, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
            var source = new Uint8Array(buffer, 4, 4);

            var cloned = structuredClone(source);
            expect(cloned.byteOffset).toBe(4);
            expect(cloned.length).toBe(4);
            expect(cloned.buffer.byteLength).toBe(16);
            expect(cloned[0]).toBe(9);
            expect(cloned[3]).toBe(6);
        });

        it("clones a DataView over its slice of the buffer", function () {
            var buffer = new ArrayBuffer(12);
            var source = new DataView(buffer, 4, 8);
            source.setFloat64(0, 1.5);

            var cloned = structuredClone(source);
            expect(cloned instanceof DataView).toBe(true);
            expect(cloned.byteOffset).toBe(4);
            expect(cloned.byteLength).toBe(8);
            expect(cloned.buffer.byteLength).toBe(12);
            expect(cloned.getFloat64(0)).toBe(1.5);
        });

        it("keeps views over one buffer sharing one cloned buffer", function () {
            var buffer = new ArrayBuffer(8);
            var cloned = structuredClone({ a: new Uint8Array(buffer), b: new Uint8Array(buffer) });

            expect(cloned.a.buffer).toBe(cloned.b.buffer);
            cloned.a[0] = 5;
            expect(cloned.b[0]).toBe(5);
        });
    });

    describe("graph shape", function () {
        it("preserves identity of an object referenced twice", function () {
            var shared = { s: 1 };
            var cloned = structuredClone({ x: shared, y: shared });

            expect(cloned.x).toBe(cloned.y);
            expect(cloned.x).not.toBe(shared);

            cloned.x.s = 2;
            expect(cloned.y.s).toBe(2);
            expect(shared.s).toBe(1);
        });

        it("round-trips a self-referencing object", function () {
            var source = { name: "root" };
            source.self = source;

            var cloned = structuredClone(source);
            expect(cloned.name).toBe("root");
            expect(cloned.self).toBe(cloned);
            expect(cloned.self).not.toBe(source);
        });

        it("round-trips a longer cycle through arrays and Maps", function () {
            var a = { name: "a" };
            var b = { name: "b", a: a };
            a.b = b;
            a.list = [a, b];

            var map = new Map();
            map.set("a", a);
            a.map = map;

            var cloned = structuredClone(a);
            expect(cloned.b.a).toBe(cloned);
            expect(cloned.list[0]).toBe(cloned);
            expect(cloned.list[1]).toBe(cloned.b);
            expect(cloned.map.get("a")).toBe(cloned);
        });
    });

    describe("uncloneable values", function () {
        it("throws DataCloneError for a function", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(function () { });
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({ fn: function () { } });
            });
        });

        it("throws DataCloneError for a symbol", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(Symbol("nope"));
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({ sym: Symbol("nope") });
            });
        });

        it("throws DataCloneError for WeakMap and WeakSet", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(new WeakMap());
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(new WeakSet());
            });
        });

        it("throws DataCloneError for a WeakRef", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(new WeakRef({}));
            });
        });

        it("throws DataCloneError for a Promise", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(Promise.resolve(1));
            });
        });

        it("leaves nothing broken after a failed clone", function () {
            var source = { ok: 1, bad: function () { } };
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(source);
            });
            expect(structuredClone({ ok: source.ok }).ok).toBe(1);
        });

        if (isV8iOS) {
            it("throws DataCloneError for a native object", function () {
                expectThrowsNamed("DataCloneError", function () {
                    structuredClone(NSObject.alloc().init());
                });
            });
        }
    });

    describe("transfer", function () {
        it("detaches the source buffer and hands over its memory", function () {
            var source = new ArrayBuffer(4);
            new Uint8Array(source).set([1, 2, 3, 4]);

            var cloned = structuredClone(source, { transfer: [source] });
            expect(cloned instanceof ArrayBuffer).toBe(true);
            expect(cloned.byteLength).toBe(4);
            expect(new Uint8Array(cloned)[2]).toBe(3);
            expect(source.byteLength).toBe(0);
        });

        it("transfers a buffer reached through a typed array in the value", function () {
            var buffer = new ArrayBuffer(8);
            var view = new Uint8Array(buffer);
            view[0] = 7;
            view[7] = 9;

            var cloned = structuredClone({ view: view }, { transfer: [buffer] });
            expect(cloned.view.length).toBe(8);
            expect(cloned.view[0]).toBe(7);
            expect(cloned.view[7]).toBe(9);
            expect(buffer.byteLength).toBe(0);
            expect(view.length).toBe(0);
        });

        it("transfers several buffers at once", function () {
            var first = new ArrayBuffer(2);
            var second = new ArrayBuffer(3);

            var cloned = structuredClone({ first: first, second: second }, { transfer: [first, second] });
            expect(cloned.first.byteLength).toBe(2);
            expect(cloned.second.byteLength).toBe(3);
            expect(first.byteLength).toBe(0);
            expect(second.byteLength).toBe(0);
        });

        it("transfers a buffer that is not part of the cloned value", function () {
            var unrelated = new ArrayBuffer(4);
            var cloned = structuredClone({ n: 1 }, { transfer: [unrelated] });

            expect(cloned.n).toBe(1);
            expect(unrelated.byteLength).toBe(0);
        });

        it("accepts any iterable as the transfer list", function () {
            var buffer = new ArrayBuffer(4);
            var cloned = structuredClone(buffer, { transfer: new Set([buffer]) });

            expect(cloned.byteLength).toBe(4);
            expect(buffer.byteLength).toBe(0);
        });

        it("accepts an absent, undefined or empty transfer list", function () {
            var buffer = new ArrayBuffer(4);
            expect(structuredClone(buffer, {}).byteLength).toBe(4);
            expect(structuredClone(buffer, { transfer: undefined }).byteLength).toBe(4);
            expect(structuredClone(buffer, { transfer: [] }).byteLength).toBe(4);
            expect(buffer.byteLength).toBe(4);
        });

        it("throws DataCloneError when the same buffer is listed twice", function () {
            var buffer = new ArrayBuffer(4);
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(buffer, { transfer: [buffer, buffer] });
            });
        });

        it("throws DataCloneError for a non-transferable entry", function () {
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({}, { transfer: [{}] });
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({}, { transfer: [5] });
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone({}, { transfer: [new Uint8Array(4)] });
            });
        });

        it("throws DataCloneError for an already detached buffer", function () {
            var buffer = new ArrayBuffer(4);
            structuredClone(buffer, { transfer: [buffer] });

            expectThrowsNamed("DataCloneError", function () {
                structuredClone(buffer, { transfer: [buffer] });
            });
            expectThrowsNamed("DataCloneError", function () {
                structuredClone(buffer);
            });
        });

        it("throws TypeError for a non-iterable transfer list", function () {
            expectThrowsTypeError(function () {
                structuredClone({}, { transfer: 5 });
            });
            expectThrowsTypeError(function () {
                structuredClone({}, { transfer: null });
            });
            expectThrowsTypeError(function () {
                structuredClone({}, { transfer: {} });
            });
            expectThrowsTypeError(function () {
                structuredClone({}, { transfer: "abc" });
            });
        });
    });

    describe("arguments", function () {
        it("throws TypeError when called without a value", function () {
            expectThrowsTypeError(function () {
                structuredClone();
            });
        });

        it("throws TypeError when options is not an object", function () {
            expectThrowsTypeError(function () {
                structuredClone({}, 5);
            });
            expectThrowsTypeError(function () {
                structuredClone({}, "transfer");
            });
        });

        it("accepts undefined and null options", function () {
            expect(structuredClone(1, undefined)).toBe(1);
            expect(structuredClone(1, null)).toBe(1);
        });
    });

    describe("workers", function () {
        var originalTimeout;

        beforeEach(function () {
            originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000; // For slower android emulators
        });

        afterEach(function () {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
        });

        it("is available inside a worker", function (done) {
            var worker = new Worker("../Workers/EvalWorker.js");
            worker.onmessage = function (msg) {
                expect(msg.data.t).toBe("function");
                worker.terminate();
                done();
            };
            worker.postMessage({ eval: "postMessage({ t: typeof structuredClone })" });
        });
    });
});
