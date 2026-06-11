describe("TNS import", function () {
    // The V8-based iOS runtime (@nativescript/ios); the legacy JSC runtime exposes TNSRuntime.
    // It does not support ES `import` statements in CommonJS (.js) modules -
    // apps are expected to be transpiled/bundled.
    var isV8iOS = !!global.NSObject && !global.TNSRuntime;

    afterEach(TNSClearOutput);

    (isV8iOS ? xit : it)("JSON files", function () {
        require("./ImportJSON");
        expect(TNSGetOutput()).toBe("testValue");
    });

    (isV8iOS ? xit : it)("CommonJS", function () {
        require("./ImportCommonJS");
        expect(TNSGetOutput()).toBe("42");
    });
});
