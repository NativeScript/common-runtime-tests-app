exports.runImportTests = function() {
    require("./Import");
}

exports.runRequireTests = function() {
    require("./Require");
}

exports.runWeakRefTests = function() {
    require("./WeakRef");
}

exports.runRuntimeTests = function() {
    require("./RuntimeTests");
}

exports.runWorkerTests = function() {
    require("./Workers");
}

exports.runPerformanceTests = function() {
    require("./Performance");
}

exports.runStructuredCloneTests = function() {
    require("./StructuredClone");
}

exports.runTextEncodingTests = function() {
    require("./TextEncoding");
}

exports.runAllTests = function() {
    exports.runImportTests();
    exports.runRequireTests();
    exports.runWeakRefTests();
    exports.runRuntimeTests();
    exports.runWorkerTests();
    exports.runPerformanceTests();
    exports.runStructuredCloneTests();
    exports.runTextEncodingTests();
}
