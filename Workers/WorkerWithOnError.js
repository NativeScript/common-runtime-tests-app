onmessage = function(msg) {
    if(msg == "with onerror returning true") {
        attachOnErrorWithTrue();
        throw "42";
    } else if (msg == "with onerror returning false") {
        attachOnErrorWithFalse();
        throw "16";
    }
}

function attachOnErrorWithTrue() {
    onerror = function(err) {
        postMessage(err);
        return true;
    }
}

function attachOnErrorWithFalse() {
    onerror = function(err) {
        return false;
    }
}