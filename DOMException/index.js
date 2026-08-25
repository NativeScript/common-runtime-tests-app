// Suite for the DOMException interface (Web IDL Standard §4.3).
//
// The suite gates itself on the API being present, so it can sit in
// runAllTests() on every runtime and report a visible pending spec where
// DOMException does not exist yet, rather than being wired in per-runtime.
//
// A runtime that DOES implement it must keep an unguarded canary in its own
// suite asserting the global is there (on iOS:
// TestRunner/app/tests/RuntimeImplementedAPIs.js). Without one, this gate
// would quietly turn a regression that removed the API into a skipped suite.
//
// The integration specs at the bottom assert that OTHER web APIs throw real
// DOMExceptions. Each is additionally gated on that API existing, so a
// runtime that has DOMException but not (say) AbortSignal only skips the
// pairing, not the interface tests.

var globalObject = typeof globalThis !== "undefined" ? globalThis : global;

if (typeof globalObject.DOMException === "undefined") {
    describe("DOMException", function () {
        it("is skipped: this runtime does not implement DOMException", function () {
            pending();
        });
    });
    return;
}

var DOMException = globalObject.DOMException;

function captureThrown(fn) {
    try {
        fn();
    } catch (e) {
        return e;
    }
    return null;
}

// Web IDL §4.3.4: every name in the legacy code table, and the constant that
// mirrors each code. Names outside the table must map to code 0.
var legacyTable = [
    ["IndexSizeError", "INDEX_SIZE_ERR", 1],
    ["DOMStringSizeError", "DOMSTRING_SIZE_ERR", 2],
    ["HierarchyRequestError", "HIERARCHY_REQUEST_ERR", 3],
    ["WrongDocumentError", "WRONG_DOCUMENT_ERR", 4],
    ["InvalidCharacterError", "INVALID_CHARACTER_ERR", 5],
    ["NoDataAllowedError", "NO_DATA_ALLOWED_ERR", 6],
    ["NoModificationAllowedError", "NO_MODIFICATION_ALLOWED_ERR", 7],
    ["NotFoundError", "NOT_FOUND_ERR", 8],
    ["NotSupportedError", "NOT_SUPPORTED_ERR", 9],
    ["InUseAttributeError", "INUSE_ATTRIBUTE_ERR", 10],
    ["InvalidStateError", "INVALID_STATE_ERR", 11],
    ["SyntaxError", "SYNTAX_ERR", 12],
    ["InvalidModificationError", "INVALID_MODIFICATION_ERR", 13],
    ["NamespaceError", "NAMESPACE_ERR", 14],
    ["InvalidAccessError", "INVALID_ACCESS_ERR", 15],
    ["ValidationError", "VALIDATION_ERR", 16],
    ["TypeMismatchError", "TYPE_MISMATCH_ERR", 17],
    ["SecurityError", "SECURITY_ERR", 18],
    ["NetworkError", "NETWORK_ERR", 19],
    ["AbortError", "ABORT_ERR", 20],
    ["URLMismatchError", "URL_MISMATCH_ERR", 21],
    ["QuotaExceededError", "QUOTA_EXCEEDED_ERR", 22],
    ["TimeoutError", "TIMEOUT_ERR", 23],
    ["InvalidNodeTypeError", "INVALID_NODE_TYPE_ERR", 24],
    ["DataCloneError", "DATA_CLONE_ERR", 25],
];

describe("DOMException", function () {
    it("constructs with spec defaults", function () {
        var e = new DOMException();
        expect(e.message).toBe("");
        expect(e.name).toBe("Error");
        expect(e.code).toBe(0);
    });

    it("takes message and name, converting both to string", function () {
        var e = new DOMException("boom", "NotFoundError");
        expect(e.message).toBe("boom");
        expect(e.name).toBe("NotFoundError");

        var coerced = new DOMException(null, 42);
        expect(coerced.message).toBe("null");
        expect(coerced.name).toBe("42");
    });

    it("treats an explicit undefined message as absent", function () {
        expect(new DOMException(undefined, "AbortError").message).toBe("");
    });

    it("maps every legacy name to its code, on the instance and in the constants", function () {
        legacyTable.forEach(function (row) {
            var name = row[0], constant = row[1], code = row[2];
            expect(new DOMException("m", name).code).toBe(code);
            expect(DOMException[constant]).toBe(code);
            expect(DOMException.prototype[constant]).toBe(code);
        });
    });

    it("maps a name outside the legacy table to code 0", function () {
        expect(new DOMException("m", "NotAllowedError").code).toBe(0);
        expect(new DOMException("m", "NoSuchName").code).toBe(0);
    });

    it("inherits from Error", function () {
        var e = new DOMException("m", "AbortError");
        expect(e instanceof DOMException).toBe(true);
        expect(e instanceof Error).toBe(true);
        expect(Object.getPrototypeOf(DOMException.prototype)).toBe(Error.prototype);
    });

    it("stringifies as name: message through Error.prototype.toString", function () {
        expect(String(new DOMException("boom", "NotFoundError"))).toBe("NotFoundError: boom");
        expect(String(new DOMException("", "AbortError"))).toBe("AbortError");
    });

    it("brands via Object.prototype.toString", function () {
        expect(Object.prototype.toString.call(new DOMException())).toBe("[object DOMException]");
    });

    it("defines name, message and code as prototype accessors", function () {
        ["name", "message", "code"].forEach(function (key) {
            var desc = Object.getOwnPropertyDescriptor(DOMException.prototype, key);
            expect(desc).toBeDefined();
            expect(typeof desc.get).toBe("function");
            expect(desc.set).toBeUndefined();
        });
    });

    it("rejects a foreign receiver on the accessors", function () {
        var get = Object.getOwnPropertyDescriptor(DOMException.prototype, "name").get;
        expect(captureThrown(function () { get.call({}); })).not.toBeNull();
    });

    it("is named DOMException with both constructor arguments optional", function () {
        expect(DOMException.name).toBe("DOMException");
        expect(DOMException.length).toBe(0);
    });

    it("carries a stack where this runtime's errors do", function () {
        if (typeof new Error().stack !== "string") {
            pending();
            return;
        }
        expect(typeof new DOMException("m", "AbortError").stack).toBe("string");
    });
});

describe("DOMException integration", function () {
    var hasAbortSignal =
        typeof globalObject.AbortSignal === "function" &&
        typeof globalObject.AbortSignal.abort === "function";

    (hasAbortSignal ? it : xit)("is the class of AbortSignal.abort()'s default reason", function () {
        var reason = globalObject.AbortSignal.abort().reason;
        expect(reason instanceof DOMException).toBe(true);
        expect(reason.name).toBe("AbortError");
        expect(reason.code).toBe(DOMException.ABORT_ERR);
    });

    var hasTimeout =
        typeof globalObject.AbortSignal === "function" &&
        typeof globalObject.AbortSignal.timeout === "function";

    (hasTimeout ? it : xit)("is the class of AbortSignal.timeout()'s reason", function (done) {
        var signal = globalObject.AbortSignal.timeout(1);
        signal.addEventListener("abort", function () {
            expect(signal.reason instanceof DOMException).toBe(true);
            expect(signal.reason.name).toBe("TimeoutError");
            done();
        });
    });

    var hasAtob = typeof globalObject.atob === "function";

    (hasAtob ? it : xit)("is the class of atob's InvalidCharacterError", function () {
        var thrown = captureThrown(function () { globalObject.atob("a"); });
        expect(thrown instanceof DOMException).toBe(true);
        expect(thrown.name).toBe("InvalidCharacterError");
        expect(thrown.code).toBe(DOMException.INVALID_CHARACTER_ERR);
    });

    var hasStructuredClone = typeof globalObject.structuredClone === "function";

    (hasStructuredClone ? it : xit)("is the class of structuredClone's DataCloneError", function () {
        var thrown = captureThrown(function () { globalObject.structuredClone(function () {}); });
        expect(thrown instanceof DOMException).toBe(true);
        expect(thrown.name).toBe("DataCloneError");
        expect(thrown.code).toBe(DOMException.DATA_CLONE_ERR);
    });
});
