onmessage = function (msg) {
    if (msg == "ping") {
        postMessage("pong");
    } else if (msg == "close") {
        close();
        postMessage("message after close");
    }
}
