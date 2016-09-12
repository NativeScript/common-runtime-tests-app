var signatureString = "WorkerWithOnMessage-gg";
onmessage = function(msg) {
    postMessage(msg + signatureString);
}