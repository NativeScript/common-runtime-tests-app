// Worker helper for the WorkerEvents suite. The parent hands over one end of a
// MessageChannel — and, in one spec, an ArrayBuffer alongside it — and the two
// then talk over that port alone: the echo never goes back through the
// worker's own postMessage.
onmessage = function (event) {
    var port = event.ports[0];
    if (!port) {
        postMessage({ ready: false, reason: "no port in event.ports" });
        return;
    }

    port.onmessage = function (portEvent) {
        port.postMessage("worker echoes " + portEvent.data);
    };

    postMessage({
        ready: true,
        portCount: event.ports.length,
        portInGraph: !!event.data && event.data.port === port,
        bufferLength: !!event.data && event.data.buffer ? event.data.buffer.byteLength : -1
    });
};
