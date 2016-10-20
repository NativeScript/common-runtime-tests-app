exports.runAllTest = function() {
    runImportTests();
    runRequireTests();
    runWeakRefTests();
    runRuntimeTests();
    runWorkerTests();
}

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