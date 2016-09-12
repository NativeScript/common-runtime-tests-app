onmessage = function(msg) {
    if(msg == "ping") {
        postMessage("pong");
    } else if (msg == "freeze") {
        while(1) {}
    } else if (msg == "close") {
        close();
    }
}