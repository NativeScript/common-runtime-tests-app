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

exports.runDOMExceptionTests = function() {
    require("./DOMException");
}

exports.runEventsTests = function() {
    require("./Events");
}

exports.runMessageEventTests = function() {
    require("./MessageEvent");
}

exports.runMessageChannelTests = function() {
    require("./MessageChannel");
}

exports.runBroadcastChannelTests = function() {
    require("./BroadcastChannel");
}

exports.runWorkerEventsTests = function() {
    require("./WorkerEvents");
}

exports.runNodeWorkerThreadsTests = function() {
    require("./NodeWorkerThreads");
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
    exports.runDOMExceptionTests();
    exports.runEventsTests();
    exports.runMessageEventTests();
    exports.runMessageChannelTests();
    exports.runBroadcastChannelTests();
    exports.runWorkerEventsTests();
    exports.runNodeWorkerThreadsTests();
}
