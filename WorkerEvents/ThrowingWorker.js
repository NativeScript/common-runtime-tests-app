// Worker helper for the WorkerEvents suite: throws out of its message handler
// so the parent's error path can be observed.
//
// The scope handler is what makes the throw reach the parent at all — the
// runtime forwards an error to the parent only once the worker scope has been
// offered it and declined by returning falsy.
onerror = function () {
    return false;
};

onmessage = function () {
    throw new Error("worker helper threw on purpose");
};
