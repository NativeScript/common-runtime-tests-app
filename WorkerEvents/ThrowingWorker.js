// Worker helper for the WorkerEvents suite: throws out of its message handler
// so the parent's error path can be observed. It deliberately installs NO
// scope `onerror` — an error the worker scope never handles must still reach
// the parent.
onmessage = function () {
    throw new Error("worker helper threw on purpose");
};
