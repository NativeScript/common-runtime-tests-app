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

// Deliberately outside runAllTests(): structuredClone is not available on every
// runtime yet, so each one opts in once it ships the global.
exports.runStructuredCloneTests = function() {
    require("./StructuredClone");
}

exports.runAllTests = function() {
    exports.runImportTests();
    exports.runRequireTests();
    exports.runWeakRefTests();
    exports.runRuntimeTests();
    exports.runWorkerTests();
}
