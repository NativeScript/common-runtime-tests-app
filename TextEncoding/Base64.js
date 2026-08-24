// Suite for the WHATWG base64 globals, atob() and btoa().
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where the
// base64 globals do not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement them must keep an unguarded canary in its own
// suite asserting the globals are there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate would
// quietly turn a regression that removed the API into a skipped suite.
//
// Failures are asserted by `.name === "InvalidCharacterError"` rather than by
// `instanceof DOMException`: runtimes without a DOMException throw a plain
// Error carrying that name.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.atob === "undefined" || typeof globalObject.btoa === "undefined") {
    describe("base64 globals", function () {
        it("is skipped: this runtime does not implement atob/btoa", function () {
            pending();
        });
    });
    return;
}

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

function expectInvalidCharacter(fn) {
    return expectThrowsNamed(fn, "InvalidCharacterError");
}

function binaryString(list) {
    var text = "";
    for (var i = 0; i < list.length; i++) {
        text += String.fromCharCode(list[i]);
    }
    return text;
}

function everyByte() {
    var list = [];
    for (var i = 0; i < 256; i++) {
        list.push(i);
    }
    return list;
}

describe("btoa", function () {
    it("is a function on the global", function () {
        expect(typeof btoa).toBe("function");
        expect(btoa.name).toBe("btoa");
        expect(btoa.length).toBe(1);
    });

    it("encodes the empty string as the empty string", function () {
        expect(btoa("")).toBe("");
    });

    it("encodes hello", function () {
        expect(btoa("hello")).toBe("aGVsbG8=");
    });

    it("pads each input length as the base64 alphabet requires", function () {
        var inputs = ["f", "fo", "foo", "foob", "fooba", "foobar"];
        var encoded = inputs.map(function (input) {
            return btoa(input);
        });

        expect(encoded).toEqual(["Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"]);
    });

    it("encodes code units across the whole byte range", function () {
        expect(btoa("\u0000")).toBe("AA==");
        expect(btoa("\u00FF")).toBe("/w==");
        expect(btoa("\u0000\u0000\u0000")).toBe("AAAA");
        expect(btoa("\u00FF\u00FF\u00FF")).toBe("////");
        // Covers the two alphabet entries that are not alphanumeric.
        expect(btoa("\u00FB\u00FF\u00BF")).toBe("+/+/");
    });

    it("coerces its argument to a string", function () {
        expect(btoa(123)).toBe(btoa("123"));
        expect(btoa(true)).toBe(btoa("true"));
        expect(btoa(null)).toBe(btoa("null"));
    });

    it("throws InvalidCharacterError for a code unit above U+00FF", function () {
        expectInvalidCharacter(function () {
            btoa("\u0100");
        });
        expectInvalidCharacter(function () {
            btoa("a\u20ACb");
        });
        expectInvalidCharacter(function () {
            btoa("\uD83D\uDE00");
        });
    });
});

describe("atob", function () {
    it("is a function on the global", function () {
        expect(typeof atob).toBe("function");
        expect(atob.name).toBe("atob");
        expect(atob.length).toBe(1);
    });

    it("decodes the empty string as the empty string", function () {
        expect(atob("")).toBe("");
    });

    it("decodes hello", function () {
        expect(atob("aGVsbG8=")).toBe("hello");
    });

    it("decodes each padded length", function () {
        var inputs = ["Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"];
        var decoded = inputs.map(function (input) {
            return atob(input);
        });

        expect(decoded).toEqual(["f", "fo", "foo", "foob", "fooba", "foobar"]);
    });

    it("returns one code unit per decoded byte", function () {
        var high = atob("/w==");
        expect(high.length).toBe(1);
        expect(high.charCodeAt(0)).toBe(0xFF);

        var zero = atob("AA==");
        expect(zero.length).toBe(1);
        expect(zero.charCodeAt(0)).toBe(0);

        expect(atob("+/+/")).toBe("\u00FB\u00FF\u00BF");
    });

    it("ignores ASCII whitespace anywhere in the input", function () {
        expect(atob("aGV s\tbG8=")).toBe("hello");
        expect(atob("  aGVsbG8=  ")).toBe("hello");
        expect(atob("aGVs\nbG8\r=")).toBe("hello");
        expect(atob("a\fGVsbG8=")).toBe("hello");
    });

    it("accepts input with the padding left off", function () {
        expect(atob("aGVsbG8")).toBe("hello");
        expect(atob("Zg")).toBe("f");
        expect(atob("Zm8")).toBe("fo");
    });

    it("throws InvalidCharacterError when the length is one past a multiple of four", function () {
        expectInvalidCharacter(function () {
            atob("a");
        });
        expectInvalidCharacter(function () {
            atob("aGVsb");
        });
        // Whitespace is removed before the length is checked, so this is the
        // same one-past case rather than a whitespace rejection.
        expectInvalidCharacter(function () {
            atob(" a ");
        });
    });

    it("throws InvalidCharacterError for a character outside the alphabet", function () {
        expectInvalidCharacter(function () {
            atob("a*bc");
        });
        expectInvalidCharacter(function () {
            atob("a=bc");
        });
        expectInvalidCharacter(function () {
            atob("aGV\u00E9bG8=");
        });
        // The base64url alphabet is not accepted.
        expectInvalidCharacter(function () {
            atob("-_-_");
        });
    });
});

describe("base64 round trips", function () {
    it("round-trips text through btoa and back", function () {
        var samples = ["", "a", "ab", "abc", "hello world", "\u0000\u0001\u0002", "\u00FF\u00FE\u00FD"];
        var roundTripped = samples.map(function (sample) {
            return atob(btoa(sample));
        });

        expect(roundTripped).toEqual(samples);
    });

    it("round-trips a binary string covering every byte value", function () {
        var source = binaryString(everyByte());
        var decoded = atob(btoa(source));

        expect(decoded.length).toBe(256);
        expect(decoded).toBe(source);
    });

    it("round-trips every input length across one four-byte group", function () {
        var lengths = [1, 2, 3, 4, 5];
        var roundTripped = lengths.map(function (length) {
            var source = binaryString(everyByte().slice(0, length));
            return atob(btoa(source)) === source;
        });

        expect(roundTripped).toEqual([true, true, true, true, true]);
    });
});
