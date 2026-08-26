// Worker helper for the WorkerEvents suite: reports how the worker global
// scope saw the message it was sent. The addEventListener registration is made
// before the onmessage assignment so the report can go out from the second of
// the two to run.
var order = [];

addEventListener("message", function () {
    order.push("listener");
});

function handler(event) {
    order.push("handler");
    postMessage({
        order: order,
        type: event.type,
        data: event.data,
        ports: event.ports.length,
        isEvent: event instanceof Event,
        isMessageEvent: typeof MessageEvent === "function" && event instanceof MessageEvent,
        onmessageReadsBack: onmessage === handler,
        // The scope dispatches on the EventTarget backing the global listener
        // methods rather than on globalThis, so `target` is that object.
        targetIsGlobalThis: event.target === globalThis,
        hasTarget: event.target !== null && event.target !== undefined
    });
}

onmessage = handler;
