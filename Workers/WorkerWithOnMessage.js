var signatureString = "WorkerWithOnMessage-gg";
onmessage = function(msg) {
    if(typeof(msg) == "object") {
        postMessage(msg);
    } else {
        postMessage(msg + signatureString);
    }
}