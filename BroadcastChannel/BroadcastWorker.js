// Helper for the cross-isolate BroadcastChannel specs: joins the named group
// the main thread hands it, echoes back everything it hears on that channel,
// and closes on request so no channel outlives the spec.
var channel = null;

onmessage = function (msg) {
    var command = msg.data;

    if (command && command.join) {
        channel = new BroadcastChannel(command.join);
        channel.onmessage = function (event) {
            channel.postMessage("worker echo: " + event.data);
        };
        // The main thread waits for this before broadcasting: a message sent
        // before the channel exists reaches nobody.
        postMessage("joined");
        return;
    }

    if (command === "close") {
        if (channel !== null) {
            channel.close();
            channel = null;
        }
        postMessage("closed");
    }
};
