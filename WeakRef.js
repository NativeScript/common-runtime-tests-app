describe("WeakRef", function () {
    it("should exist", function () {
        expect(WeakRef).toBeDefined();
    });

    it("should work", function () {
        //TODO: jasmine somehow breaks __collect. consider removing the TNSRunScript workaround if the test ever works inside jasmine
        TNSRunScript(
            "var obj = { };" +
            "var weakref = new WeakRef(obj);" +

            "obj = null;" +
            "__collect();" +

            "TNSLog(weakref.get() === null ? '1' : '0');"
        );

        expect(TNSGetOutput()).toBe("1");
    });

    it("should throw when constructed with zero parameters", function () {
        expect(function () {
            new WeakRef();
        }).toThrow();
    });

    it("should throw when constructed with primitive parameters", function () {
        for (var primitive of [null, undefined, 0])
        {
            expect(function () {
                new WeakRef(primitive);
            }).toThrow();
        }
    });

    it("should be clearable", function () {
        var obj = {};
        var weakref = new WeakRef(obj);

        weakref.clear();

        expect(weakref.get()).toBeNull();
    });
});
