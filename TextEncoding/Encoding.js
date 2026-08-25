// Suite for the WHATWG TextEncoder and TextDecoder globals.
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where the
// encoding API does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement them must keep an unguarded canary in its own
// suite asserting the globals are there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate would
// quietly turn a regression that removed the API into a skipped suite.
//
// Only utf-8 is required here. The label registry is large and runtimes ship
// different subsets of it, so every encoding past utf-8 sits behind a
// constructor probe. For the same reason nothing here asserts that a real
// label is rejected - only a label that is in no registry at all.
//
// Text is written with \u escapes, never literal characters: a spec must keep
// pinning the exact code point even if the file's own encoding is rewritten.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.TextEncoder === "undefined" || typeof globalObject.TextDecoder === "undefined") {
    describe("Text encoding", function () {
        it("is skipped: this runtime does not implement TextEncoder/TextDecoder", function () {
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

function expectThrowsTypeError(fn) {
    var thrown = expectThrowsNamed(fn, "TypeError");
    expect(thrown instanceof TypeError).toBe(true);
    return thrown;
}

function expectThrowsRangeError(fn) {
    var thrown = expectThrowsNamed(fn, "RangeError");
    expect(thrown instanceof RangeError).toBe(true);
    return thrown;
}

function bytes(list) {
    return new Uint8Array(list);
}

// Byte and code unit sequences are compared as plain arrays so a failure
// prints the two sequences rather than two typed array objects.
function toArray(view) {
    return Array.prototype.slice.call(view);
}

function codeUnits(text) {
    var units = [];
    for (var i = 0; i < text.length; i++) {
        units.push(text.charCodeAt(i));
    }
    return units;
}

function repeat(value, count) {
    var list = [];
    for (var i = 0; i < count; i++) {
        list.push(value);
    }
    return list;
}

function supportsEncoding(label) {
    try {
        new TextDecoder(label);
        return true;
    } catch (e) {
        return false;
    }
}

function describeEncoding(label, title, body) {
    if (supportsEncoding(label)) {
        describe(title, body);
        return;
    }
    describe(title, function () {
        it("is skipped: this runtime does not support the " + label + " encoding", function () {
            pending();
        });
    });
}

describe("Text encoding globals", function () {
    it("exposes TextEncoder and TextDecoder as constructors", function () {
        expect(typeof TextEncoder).toBe("function");
        expect(typeof TextDecoder).toBe("function");
        expect(TextEncoder.name).toBe("TextEncoder");
        expect(TextDecoder.name).toBe("TextDecoder");
    });

    it("produces instances of the constructor", function () {
        expect(new TextEncoder() instanceof TextEncoder).toBe(true);
        expect(new TextDecoder() instanceof TextDecoder).toBe(true);
        expect(Object.getPrototypeOf(new TextDecoder())).toBe(TextDecoder.prototype);
    });

    it("tags instances for Object.prototype.toString", function () {
        expect(Object.prototype.toString.call(new TextEncoder())).toBe("[object TextEncoder]");
        expect(Object.prototype.toString.call(new TextDecoder())).toBe("[object TextDecoder]");
    });

    it("cannot be called without new", function () {
        expectThrowsTypeError(function () {
            TextEncoder();
        });
        expectThrowsTypeError(function () {
            TextDecoder();
        });
    });

    it("keeps its methods on the prototype", function () {
        expect(typeof TextEncoder.prototype.encode).toBe("function");
        expect(typeof TextEncoder.prototype.encodeInto).toBe("function");
        expect(typeof TextDecoder.prototype.decode).toBe("function");
        expect(new TextEncoder().hasOwnProperty("encode")).toBe(false);
        expect(new TextDecoder().hasOwnProperty("decode")).toBe(false);
    });

    it("brand-checks the prototype methods", function () {
        expectThrowsTypeError(function () {
            TextEncoder.prototype.encode.call({}, "a");
        });
        expectThrowsTypeError(function () {
            TextEncoder.prototype.encodeInto.call({}, "a", new Uint8Array(4));
        });
        expectThrowsTypeError(function () {
            TextDecoder.prototype.decode.call({}, new Uint8Array(1));
        });
    });
});

describe("TextEncoder", function () {
    var encoder;

    beforeEach(function () {
        encoder = new TextEncoder();
    });

    it("only ever encodes utf-8", function () {
        expect(encoder.encoding).toBe("utf-8");
        // The constructor takes no arguments, so a label is not an encoding choice.
        expect(new TextEncoder("utf-16le").encoding).toBe("utf-8");
    });

    it("encodes nothing when called with no argument", function () {
        var result = encoder.encode();

        expect(result instanceof Uint8Array).toBe(true);
        expect(result.length).toBe(0);
    });

    it("encodes the empty string as an empty Uint8Array", function () {
        expect(toArray(encoder.encode(""))).toEqual([]);
    });

    it("encodes ASCII as one byte per code point", function () {
        expect(toArray(encoder.encode("abc"))).toEqual([0x61, 0x62, 0x63]);
        expect(encoder.encode("hello world").length).toBe(11);
    });

    it("encodes BMP code points as two- and three-byte sequences", function () {
        expect(toArray(encoder.encode("\u00E9"))).toEqual([0xC3, 0xA9]);
        expect(toArray(encoder.encode("\u07FF"))).toEqual([0xDF, 0xBF]);
        expect(toArray(encoder.encode("\u0800"))).toEqual([0xE0, 0xA0, 0x80]);
        expect(toArray(encoder.encode("\u20AC"))).toEqual([0xE2, 0x82, 0xAC]);
        expect(toArray(encoder.encode("\uFFFD"))).toEqual([0xEF, 0xBF, 0xBD]);
    });

    it("encodes a surrogate pair as one four-byte sequence", function () {
        expect(toArray(encoder.encode("\uD83D\uDE00"))).toEqual([0xF0, 0x9F, 0x98, 0x80]);
        expect(toArray(encoder.encode("\uD800\uDC00"))).toEqual([0xF0, 0x90, 0x80, 0x80]);
        expect(toArray(encoder.encode("\uDBFF\uDFFF"))).toEqual([0xF4, 0x8F, 0xBF, 0xBF]);
    });

    it("replaces a lone surrogate with U+FFFD", function () {
        expect(toArray(encoder.encode("\uD800"))).toEqual([0xEF, 0xBF, 0xBD]);
        expect(toArray(encoder.encode("\uDC00"))).toEqual([0xEF, 0xBF, 0xBD]);
        expect(toArray(encoder.encode("a\uD800b"))).toEqual([0x61, 0xEF, 0xBF, 0xBD, 0x62]);
        expect(toArray(encoder.encode("\uD800\uD800"))).toEqual([0xEF, 0xBF, 0xBD, 0xEF, 0xBF, 0xBD]);
    });

    it("encodes mixed text in order", function () {
        expect(toArray(encoder.encode("a\u00E9\u20AC\uD83D\uDE00")))
            .toEqual([0x61, 0xC3, 0xA9, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80]);
    });

    describe("encodeInto", function () {
        it("reports read and written for a destination that fits exactly", function () {
            var destination = new Uint8Array(3);
            var result = encoder.encodeInto("abc", destination);

            expect(result.read).toBe(3);
            expect(result.written).toBe(3);
            expect(toArray(destination)).toEqual([0x61, 0x62, 0x63]);
        });

        it("leaves the tail of a larger destination untouched", function () {
            var destination = new Uint8Array(5);
            var result = encoder.encodeInto("ab", destination);

            expect(result.read).toBe(2);
            expect(result.written).toBe(2);
            expect(toArray(destination)).toEqual([0x61, 0x62, 0, 0, 0]);
        });

        it("reports zero for an empty source", function () {
            var destination = new Uint8Array(4);
            var result = encoder.encodeInto("", destination);

            expect(result.read).toBe(0);
            expect(result.written).toBe(0);
            expect(toArray(destination)).toEqual([0, 0, 0, 0]);
        });

        it("reports zero for a zero-length destination", function () {
            var result = encoder.encodeInto("abc", new Uint8Array(0));

            expect(result.read).toBe(0);
            expect(result.written).toBe(0);
        });

        it("stops at the last code point that fits whole", function () {
            var destination = new Uint8Array(3);
            var result = encoder.encodeInto("ab\u00E9", destination);

            expect(result.read).toBe(2);
            expect(result.written).toBe(2);
            expect(toArray(destination)).toEqual([0x61, 0x62, 0]);
        });

        it("never splits an encoded code point across the end of the destination", function () {
            var twoByteFits = encoder.encodeInto("\u00E9", new Uint8Array(2));
            expect(twoByteFits.read).toBe(1);
            expect(twoByteFits.written).toBe(2);

            var destination = new Uint8Array(2);
            var threeByteDoesNot = encoder.encodeInto("\u20AC", destination);
            expect(threeByteDoesNot.read).toBe(0);
            expect(threeByteDoesNot.written).toBe(0);
            expect(toArray(destination)).toEqual([0, 0]);
        });

        it("counts a surrogate pair as two code units read", function () {
            var destination = new Uint8Array(4);
            var result = encoder.encodeInto("\uD83D\uDE00", destination);

            expect(result.read).toBe(2);
            expect(result.written).toBe(4);
            expect(toArray(destination)).toEqual([0xF0, 0x9F, 0x98, 0x80]);
        });

        it("writes nothing when a surrogate pair does not fit", function () {
            var destination = new Uint8Array(3);
            var result = encoder.encodeInto("\uD83D\uDE00", destination);

            expect(result.read).toBe(0);
            expect(result.written).toBe(0);
            expect(toArray(destination)).toEqual([0, 0, 0]);
        });

        it("writes U+FFFD for a lone surrogate", function () {
            var destination = new Uint8Array(4);
            var result = encoder.encodeInto("a\uD800", destination);

            expect(result.read).toBe(2);
            expect(result.written).toBe(4);
            expect(toArray(destination)).toEqual([0x61, 0xEF, 0xBF, 0xBD]);
        });

        it("writes into a view at its own byte offset", function () {
            var buffer = new ArrayBuffer(6);
            var destination = new Uint8Array(buffer, 2, 3);
            var result = encoder.encodeInto("xyz", destination);

            expect(result.written).toBe(3);
            expect(toArray(new Uint8Array(buffer))).toEqual([0, 0, 0x78, 0x79, 0x7A, 0]);
        });

        it("throws TypeError for a destination that is not a Uint8Array", function () {
            expectThrowsTypeError(function () {
                encoder.encodeInto("a", []);
            });
            expectThrowsTypeError(function () {
                encoder.encodeInto("a", new Uint16Array(4));
            });
        });
    });
});

describe("TextDecoder construction", function () {
    it("defaults to utf-8", function () {
        expect(new TextDecoder().encoding).toBe("utf-8");
    });

    it("normalizes every utf-8 label to the encoding name", function () {
        var labels = ["utf-8", "UTF-8", "utf8", "UTF8", "unicode-1-1-utf-8", "  utf-8\t", "\r\nutf-8\f "];
        var encodings = labels.map(function (label) {
            return new TextDecoder(label).encoding;
        });

        expect(encodings).toEqual(repeat("utf-8", labels.length));
    });

    it("throws RangeError for a label that is in no registry", function () {
        expectThrowsRangeError(function () {
            new TextDecoder("definitely-not-an-encoding");
        });
        expectThrowsRangeError(function () {
            new TextDecoder("");
        });
    });

    it("reflects the fatal and ignoreBOM options", function () {
        var byDefault = new TextDecoder();
        expect(byDefault.fatal).toBe(false);
        expect(byDefault.ignoreBOM).toBe(false);

        var configured = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
        expect(configured.fatal).toBe(true);
        expect(configured.ignoreBOM).toBe(true);

        var explicitlyOff = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false });
        expect(explicitlyOff.fatal).toBe(false);
        expect(explicitlyOff.ignoreBOM).toBe(false);
    });
});

describe("TextDecoder utf-8", function () {
    var encoder = new TextEncoder();
    var decoder;

    beforeEach(function () {
        decoder = new TextDecoder();
    });

    it("decodes nothing when called with no argument", function () {
        expect(decoder.decode()).toBe("");
        expect(decoder.decode(new Uint8Array(0))).toBe("");
    });

    it("round-trips ASCII, BMP and astral text through TextEncoder", function () {
        var samples = ["", "a", "hello world", "\u00E9\u00E8\u00EA", "\u20AC\u4E2D\u6587",
            "\uD83D\uDE00", "a\u00E9\u20AC\uD83D\uDE00z"];
        var decoded = samples.map(function (sample) {
            return decoder.decode(encoder.encode(sample));
        });

        expect(decoded).toEqual(samples);
    });

    it("accepts any BufferSource as input", function () {
        var buffer = new ArrayBuffer(5);
        new Uint8Array(buffer).set([0x68, 0x65, 0x6C, 0x6C, 0x6F]);

        expect(decoder.decode(buffer)).toBe("hello");
        expect(decoder.decode(new Uint8Array(buffer))).toBe("hello");
        expect(decoder.decode(new DataView(buffer))).toBe("hello");
        expect(decoder.decode(new Int8Array(buffer))).toBe("hello");
        expect(decoder.decode(new Uint8ClampedArray(buffer))).toBe("hello");
    });

    it("decodes only the bytes a view spans", function () {
        var buffer = new ArrayBuffer(8);
        new Uint8Array(buffer).set([0x41, 0x41, 0x68, 0x69, 0x41, 0x41, 0x41, 0x41]);

        expect(decoder.decode(new Uint8Array(buffer, 2, 2))).toBe("hi");
        expect(decoder.decode(new DataView(buffer, 2, 2))).toBe("hi");
    });

    it("strips a leading BOM by default", function () {
        expect(decoder.decode(bytes([0xEF, 0xBB, 0xBF, 0x41]))).toBe("A");
        expect(decoder.decode(bytes([0xEF, 0xBB, 0xBF]))).toBe("");
    });

    it("keeps the BOM as U+FEFF with ignoreBOM", function () {
        var keeping = new TextDecoder("utf-8", { ignoreBOM: true });

        expect(keeping.decode(bytes([0xEF, 0xBB, 0xBF, 0x41]))).toBe("\uFEFFA");
        expect(keeping.decode(bytes([0xEF, 0xBB, 0xBF]))).toBe("\uFEFF");
    });

    it("strips one BOM, and only at the start", function () {
        expect(decoder.decode(bytes([0xEF, 0xBB, 0xBF, 0xEF, 0xBB, 0xBF]))).toBe("\uFEFF");
        expect(decoder.decode(bytes([0x41, 0xEF, 0xBB, 0xBF]))).toBe("A\uFEFF");
    });

    it("emits one U+FFFD for a lone continuation byte", function () {
        expect(decoder.decode(bytes([0x80]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0xBF]))).toBe("\uFFFD");
    });

    it("emits one U+FFFD for a truncated sequence", function () {
        expect(decoder.decode(bytes([0xC3]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0xE2, 0x82]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0xF0, 0x9F]))).toBe("\uFFFD");
    });

    it("emits two U+FFFD for an overlong sequence", function () {
        // 0xC0 and 0xC1 lead no valid sequence at all, so each is an error on
        // its own and the continuation byte behind it is a second, unattached one.
        expect(decoder.decode(bytes([0xC0, 0x80]))).toBe("\uFFFD\uFFFD");
        expect(decoder.decode(bytes([0xC1, 0xBF]))).toBe("\uFFFD\uFFFD");
    });

    it("emits three U+FFFD for a surrogate encoded as three bytes", function () {
        // 0xED caps the byte after it at 0x9F; 0xA0 breaks that bound and is
        // pushed back onto the stream, so it and the byte after it are errors
        // of their own.
        expect(decoder.decode(bytes([0xED, 0xA0, 0x80]))).toBe("\uFFFD\uFFFD\uFFFD");
    });

    it("replaces invalid bytes in the middle of valid text", function () {
        expect(decoder.decode(bytes([0x41, 0xFF, 0x42]))).toBe("A\uFFFDB");
        expect(decoder.decode(bytes([0x41, 0xC3, 0x28, 0x42]))).toBe("A\uFFFD(B");
        expect(decoder.decode(bytes([0xE2, 0x82, 0xAC, 0x80, 0x41]))).toBe("\u20AC\uFFFDA");
    });

    it("throws TypeError on invalid input when fatal", function () {
        var strict = new TextDecoder("utf-8", { fatal: true });

        expectThrowsTypeError(function () {
            strict.decode(bytes([0xFF]));
        });
        expectThrowsTypeError(function () {
            strict.decode(bytes([0xC0, 0x80]));
        });
        expectThrowsTypeError(function () {
            strict.decode(bytes([0xF0, 0x9F]));
        });
    });

    it("does not throw on valid input when fatal", function () {
        var strict = new TextDecoder("utf-8", { fatal: true });

        expect(strict.decode(bytes([0x41]))).toBe("A");
        expect(strict.decode(encoder.encode("\uD83D\uDE00"))).toBe("\uD83D\uDE00");
        expect(strict.decode(bytes([0xEF, 0xBB, 0xBF, 0x41]))).toBe("A");
    });

    it("holds back a partial sequence until the next chunk", function () {
        var streaming = new TextDecoder();

        expect(streaming.decode(bytes([0xE2, 0x82]), { stream: true })).toBe("");
        expect(streaming.decode(bytes([0xAC]), { stream: true })).toBe("\u20AC");
        expect(streaming.decode()).toBe("");
    });

    it("reassembles a surrogate pair fed one byte at a time", function () {
        var streaming = new TextDecoder();
        var encoded = [0xF0, 0x9F, 0x98, 0x80];
        var text = "";

        for (var i = 0; i < encoded.length; i++) {
            text += streaming.decode(bytes([encoded[i]]), { stream: true });
        }
        text += streaming.decode();

        expect(text).toBe("\uD83D\uDE00");
    });

    it("flushes a still-truncated sequence as U+FFFD", function () {
        var streaming = new TextDecoder();

        expect(streaming.decode(bytes([0x41, 0xF0, 0x9F]), { stream: true })).toBe("A");
        expect(streaming.decode()).toBe("\uFFFD");
    });

    it("throws TypeError at the flush when fatal and a sequence is pending", function () {
        var strict = new TextDecoder("utf-8", { fatal: true });

        expect(strict.decode(bytes([0xF0, 0x9F]), { stream: true })).toBe("");
        expectThrowsTypeError(function () {
            strict.decode();
        });
    });

    it("strips a BOM split across chunks", function () {
        var streaming = new TextDecoder();
        var text = streaming.decode(bytes([0xEF]), { stream: true });
        text += streaming.decode(bytes([0xBB]), { stream: true });
        text += streaming.decode(bytes([0xBF, 0x41]), { stream: true });
        text += streaming.decode();

        expect(text).toBe("A");
    });

    it("resets its state after a decode that does not stream", function () {
        var reused = new TextDecoder();

        expect(reused.decode(bytes([0xE2, 0x82]), { stream: true })).toBe("");
        expect(reused.decode()).toBe("\uFFFD");
        expect(reused.decode(bytes([0x41]))).toBe("A");
        expect(reused.decode(bytes([0xEF, 0xBB, 0xBF, 0x42]))).toBe("B");
    });
});

describeEncoding("utf-16le", "TextDecoder utf-16le", function () {
    var decoder;

    beforeEach(function () {
        decoder = new TextDecoder("utf-16le");
    });

    it("normalizes its labels to the encoding name", function () {
        var labels = ["utf-16le", "UTF-16LE", "utf-16", "UTF-16", "  utf-16le "];
        var encodings = labels.map(function (label) {
            return new TextDecoder(label).encoding;
        });

        expect(encodings).toEqual(repeat("utf-16le", labels.length));
    });

    it("decodes little-endian code units", function () {
        expect(decoder.decode(bytes([]))).toBe("");
        expect(decoder.decode(bytes([0x41, 0x00, 0x42, 0x00]))).toBe("AB");
        expect(decoder.decode(bytes([0xAC, 0x20]))).toBe("\u20AC");
    });

    it("decodes a surrogate pair", function () {
        expect(decoder.decode(bytes([0x3D, 0xD8, 0x00, 0xDE]))).toBe("\uD83D\uDE00");
    });

    it("strips a little-endian BOM by default and keeps it with ignoreBOM", function () {
        expect(decoder.decode(bytes([0xFF, 0xFE, 0x41, 0x00]))).toBe("A");

        var keeping = new TextDecoder("utf-16le", { ignoreBOM: true });
        expect(keeping.decode(bytes([0xFF, 0xFE, 0x41, 0x00]))).toBe("\uFEFFA");
    });

    it("does not treat a big-endian BOM as a BOM", function () {
        // The label fixes the byte order - there is no sniffing - so FE FF is
        // read as the code unit U+FFFE and kept.
        expect(decoder.decode(bytes([0xFE, 0xFF, 0x41, 0x00]))).toBe("\uFFFEA");
    });

    it("emits U+FFFD for a trailing odd byte", function () {
        expect(decoder.decode(bytes([0x41]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0x41, 0x00, 0x42]))).toBe("A\uFFFD");
    });

    it("emits U+FFFD for an unpaired surrogate", function () {
        expect(decoder.decode(bytes([0x00, 0xD8]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0x00, 0xDC]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0x00, 0xD8, 0x41, 0x00]))).toBe("\uFFFDA");
    });

    it("emits one U+FFFD when a pending lead surrogate meets a trailing odd byte", function () {
        // The decoder's end-of-queue step clears the lead byte and the lead
        // surrogate together, as a single error, never two.
        expect(decoder.decode(bytes([0x00, 0xD8, 0x41]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0x41, 0x00, 0x00, 0xD8, 0x41]))).toBe("A\uFFFD");
    });

    it("throws TypeError for an unpaired surrogate when fatal", function () {
        var strict = new TextDecoder("utf-16le", { fatal: true });

        expect(strict.decode(bytes([0x41, 0x00]))).toBe("A");
        expectThrowsTypeError(function () {
            strict.decode(bytes([0x00, 0xD8]));
        });
    });

    it("joins a code unit split across chunks", function () {
        var streaming = new TextDecoder("utf-16le");

        expect(streaming.decode(bytes([0x41]), { stream: true })).toBe("");
        expect(streaming.decode(bytes([0x00]), { stream: true })).toBe("A");
        expect(streaming.decode(bytes([0x3D, 0xD8, 0x00]), { stream: true })).toBe("");
        expect(streaming.decode(bytes([0xDE]), { stream: true })).toBe("\uD83D\uDE00");
        expect(streaming.decode()).toBe("");
    });

    it("emits U+FFFD when a lead surrogate is still pending at the flush", function () {
        var streaming = new TextDecoder("utf-16le");

        expect(streaming.decode(bytes([0x3D, 0xD8]), { stream: true })).toBe("");
        expect(streaming.decode()).toBe("\uFFFD");
    });
});

describeEncoding("utf-16be", "TextDecoder utf-16be", function () {
    var decoder;

    beforeEach(function () {
        decoder = new TextDecoder("utf-16be");
    });

    it("normalizes its labels to the encoding name", function () {
        var labels = ["utf-16be", "UTF-16BE", "  utf-16be\t"];
        var encodings = labels.map(function (label) {
            return new TextDecoder(label).encoding;
        });

        expect(encodings).toEqual(repeat("utf-16be", labels.length));
    });

    it("decodes big-endian code units", function () {
        expect(decoder.decode(bytes([]))).toBe("");
        expect(decoder.decode(bytes([0x00, 0x41, 0x00, 0x42]))).toBe("AB");
        expect(decoder.decode(bytes([0x20, 0xAC]))).toBe("\u20AC");
    });

    it("decodes a surrogate pair", function () {
        expect(decoder.decode(bytes([0xD8, 0x3D, 0xDE, 0x00]))).toBe("\uD83D\uDE00");
    });

    it("strips a big-endian BOM by default and keeps it with ignoreBOM", function () {
        expect(decoder.decode(bytes([0xFE, 0xFF, 0x00, 0x41]))).toBe("A");

        var keeping = new TextDecoder("utf-16be", { ignoreBOM: true });
        expect(keeping.decode(bytes([0xFE, 0xFF, 0x00, 0x41]))).toBe("\uFEFFA");
    });

    it("does not treat a little-endian BOM as a BOM", function () {
        expect(decoder.decode(bytes([0xFF, 0xFE, 0x00, 0x41]))).toBe("\uFFFEA");
    });

    it("emits U+FFFD for a trailing odd byte", function () {
        expect(decoder.decode(bytes([0x41]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0x00, 0x41, 0x00]))).toBe("A\uFFFD");
    });

    it("emits U+FFFD for an unpaired surrogate", function () {
        expect(decoder.decode(bytes([0xD8, 0x00]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0xDC, 0x00]))).toBe("\uFFFD");
        expect(decoder.decode(bytes([0xD8, 0x00, 0x00, 0x41]))).toBe("\uFFFDA");
    });

    it("throws TypeError for an unpaired surrogate when fatal", function () {
        var strict = new TextDecoder("utf-16be", { fatal: true });

        expect(strict.decode(bytes([0x00, 0x41]))).toBe("A");
        expectThrowsTypeError(function () {
            strict.decode(bytes([0xD8, 0x00]));
        });
    });

    it("joins a code unit split across chunks", function () {
        var streaming = new TextDecoder("utf-16be");

        expect(streaming.decode(bytes([0x00]), { stream: true })).toBe("");
        expect(streaming.decode(bytes([0x41]), { stream: true })).toBe("A");
        expect(streaming.decode(bytes([0xD8, 0x3D, 0xDE]), { stream: true })).toBe("");
        expect(streaming.decode(bytes([0x00]), { stream: true })).toBe("\uD83D\uDE00");
        expect(streaming.decode()).toBe("");
    });

    it("emits U+FFFD when a lead surrogate is still pending at the flush", function () {
        var streaming = new TextDecoder("utf-16be");

        expect(streaming.decode(bytes([0xD8, 0x3D]), { stream: true })).toBe("");
        expect(streaming.decode()).toBe("\uFFFD");
    });
});

describeEncoding("windows-1252", "TextDecoder windows-1252", function () {
    var decoder;

    beforeEach(function () {
        decoder = new TextDecoder("windows-1252");
    });

    it("maps its aliases onto one encoding name", function () {
        var labels = ["windows-1252", "latin1", "iso-8859-1", "ISO-8859-1", "ascii", "us-ascii",
            "cp1252", "x-cp1252", "iso8859-1", "l1"];
        var encodings = labels.map(function (label) {
            return new TextDecoder(label).encoding;
        });

        expect(encodings).toEqual(repeat("windows-1252", labels.length));
    });

    it("decodes ASCII bytes as themselves", function () {
        var ascii = [];
        for (var code = 0x00; code < 0x80; code++) {
            ascii.push(code);
        }

        expect(codeUnits(decoder.decode(bytes(ascii)))).toEqual(ascii);
    });

    it("decodes 0x80 to 0x9F as the windows-1252 specials", function () {
        expect(decoder.decode(bytes([0x80]))).toBe("\u20AC");
        expect(decoder.decode(bytes([0x82]))).toBe("\u201A");
        expect(decoder.decode(bytes([0x8C]))).toBe("\u0152");
        expect(decoder.decode(bytes([0x91]))).toBe("\u2018");
        expect(decoder.decode(bytes([0x92]))).toBe("\u2019");
        expect(decoder.decode(bytes([0x93]))).toBe("\u201C");
        expect(decoder.decode(bytes([0x94]))).toBe("\u201D");
        expect(decoder.decode(bytes([0x96]))).toBe("\u2013");
        expect(decoder.decode(bytes([0x97]))).toBe("\u2014");
        expect(decoder.decode(bytes([0x99]))).toBe("\u2122");
        expect(decoder.decode(bytes([0x9F]))).toBe("\u0178");
    });

    it("decodes 0xA0 to 0xFF as the matching Latin-1 code points", function () {
        var high = [];
        for (var code = 0xA0; code <= 0xFF; code++) {
            high.push(code);
        }

        expect(codeUnits(decoder.decode(bytes(high)))).toEqual(high);
    });

    it("decodes a mixed run in order", function () {
        expect(decoder.decode(bytes([0x93, 0x48, 0x69, 0x94, 0x20, 0x80, 0xE9])))
            .toBe("\u201CHi\u201D \u20AC\u00E9");
    });

    it("has no BOM to strip", function () {
        expect(decoder.decode(bytes([0xEF, 0xBB, 0xBF, 0x41]))).toBe("\u00EF\u00BB\u00BFA");
    });
});
