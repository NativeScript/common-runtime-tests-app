describe("TNS Workers", () => {
    // The V8-based iOS runtime (@nativescript/ios); the legacy JSC runtime exposes TNSRuntime
    var isV8iOS = !!global.NSObject && !global.TNSRuntime;
    // Runtimes that serialize worker messages with the V8 structured clone
    // serializer (Android and @nativescript/ios); the legacy JSC runtime uses JSON
    var isStructuredClone = !global.NSObject || isV8iOS;
    let expectedAliveRuntimes = 1; // Main thread's TNSRuntime
    var originalTimeout;
    var DEFAULT_TIMEOUT_BEFORE_ASSERT = 500;

    if (global.NSObject) { // if platform is iOS
        DEFAULT_TIMEOUT_BEFORE_ASSERT = 1000;
    } else { // if Android
        // necessary in order to accommodate slower and older android emulators
        DEFAULT_TIMEOUT_BEFORE_ASSERT = 4000;
    }

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 8000; // For slower android emulators
    });

    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    var gC = global.NSObject ? __collect : gc;

    it("Should have self property equal to global", (done) => {
        var worker = new Worker("./EvalWorker");

        worker.postMessage({ eval: "postMessage(self === global);" });
        worker.onmessage = (msg) => {
            expect(msg.data).toBe(true);
            worker.terminate();
            done();
        };
    });

    it("Should throw exception when no parameter is passed", () => {
        expect(() => new Worker()).toThrow();
    });

    if (global.NSObject) {
        it("Should call worker.onerror when script does not exist", (done) => {
            var worker = new Worker("./idonot-exist.js");
            worker.onerror = (e) => {
                expect(e).not.toEqual(null);
                worker.terminate();
                done();
            }
        });
    }

    it("Should throw exception when parameter is not a proper string", () => {
        // with object parameter
        expect(() => new Worker({ filename: "./EvalWorker.js" })).toThrow();
        // with number parameter
        expect(() => new Worker(5)).toThrow();
        // with more complex parameter
        expect(() => {
            new Worker((() => {
                function a() { }
            })())
        }).toThrow();
    });

    it("Should throw exception when not invoked as constructor", () => {
        expect(() => { Worker("./EvalWorker.js"); }).toThrow();
    });

    it("Should be terminated without error", () => {
        var worker = new Worker("./EvalWorker.js");
        worker.terminate();
    });

    it("Should throw exception when Worker.postMessage is called without arguments", () => {
        var w = new Worker("./EvalWorker.js");
        expect(() => { w.postMessage(); }).toThrow();
        w.terminate();
    });

    it("Should throw exception when Worker.postMessage is called more than one argument", () => {
        var w = new Worker("./EvalWorker.js");
        expect(() => { w.postMessage("Message: 1", "Message2") }).toThrow();
        w.terminate();
    });

    it("Should not receiving messages after worker.terminate() call", (done) => {
        var worker = new Worker("./EvalWorker.js");
        worker.terminate();
        worker.postMessage({ eval: "postMessage('two');" });

        var responseCounter = 0;
        worker.onmessage = (msg) => {
            responseCounter++;
        };

        setTimeout(() => {
            expect(responseCounter).toBe(0);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Send a message from worker -> worker scope and receive back the same message", (done) => {
        var a = new Worker("./EvalWorker.js");

        var message = {
            value: "This is a very elaborate message that the worker will not know of.",
            eval: "postMessage(value);"
        }

        a.postMessage(message);
        a.onmessage = (msg) => {
            expect(msg.data).toBe(message.value);
            a.terminate();
            done();
        }
    });

    it("Send a LONG message from worker -> worker scope and receive back the same LONG message", (done) => {
        var a = new Worker("./EvalWorker.js");

        var message = {
            value: generateRandomString(5000),
            eval: "postMessage(value);"
        }

        a.postMessage(message);
        a.onmessage = (msg) => {
            expect(msg.data).toBe(message.value);
            a.terminate();
            done();
        }
    });

    it("Send an object and receive back the same object", (done) => {
        var a = new Worker("./EvalWorker.js");

        var message = {
            value: {
                str: "A message from main",
                number: 42,
                obj: { prop: "value", innerObj: { innnerProp: 67 } },
                bool: true,
                nullValue: null
            },
            eval: "postMessage(value);"
        }

        a.postMessage(message);
        a.onmessage = (msg) => {
            expect(msg.data).toEqual(message.value);
            a.terminate();
            done();
        }
    });

    it("Send an object containing repeated references", (done) => {
        var a = new Worker("./EvalWorker.js");

        var ref = { a: "a" };
        var message = {
            value: {
                obj: {
                    someProp: 5,
                    table1: [ref, ref],
                    table2: [ref]
                }
            },
            eval: "postMessage(value);"
        }

        a.postMessage(message);
        a.onmessage = (msg) => {
            expect(msg.data.obj.someProp).toEqual(message.value.obj.someProp);
            expect(msg.data.obj.table1[0].a).toEqual(message.value.obj.table1[0].a);
            expect(msg.data.obj.table1[1].a).toEqual(message.value.obj.table1[1].a);
            expect(msg.data.obj.table2[0].a).toEqual(message.value.obj.table2[0].a);
            a.terminate();
            done();
        }
    });

    it("Send many objects from worker object without waiting for response and terminate", () => {
        var a = new Worker("./EvalWorker.js");
        for (var i = 0; i < 500; i++) {
            a.postMessage({ i: i, data: generateRandomString(100), num: 123456.22 });
        }

        a.terminate();
    });

    it("Should keep the worker alive after error", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({ eval: "throw new Error('just an error');" });
        worker.postMessage({ eval: "postMessage('pong');" });
        worker.onmessage = function (msg) {
            expect(msg.data).toBe("pong");
            worker.terminate();
            done();
        }
    });

    it("Should not crash if terminate() is called more than once", () => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({ eval: "" });
        worker.terminate();
        worker.terminate();
        worker.terminate();
    });

    it("Should not crash if close() is called more than once", () => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({ eval: "close(); close(); close(); close();" });
    });

    // Test case for the issue reported in https://github.com/NativeScript/ios-runtime/issues/1137#issuecomment-496450970
    it("Should not crash on close() if native callbacks are still alive", () => {
        var worker = new Worker("./NativeCallbackWorker.js");

        worker.postMessage({ eval: "close();" });
    });

    it("Should not throw error if post message is called with native object", () => {
        var worker = new Worker("./EvalWorker.js");

        var nativeObj = global.NSObject ? new UIView() : new java.lang.Object();
        worker.postMessage(nativeObj);
        worker.terminate();
    });

    // The V8-based runtimes use the structured clone serializer, which supports
    // circular references, so posting such an object legitimately does not throw there.
    (isStructuredClone ? xit : it)("Should throw error if post circular object", (done) => {
        var worker = new Worker("./EvalWorker.js");

        var parent = { parent: true };
        var child = { parent: true };
        parent.child = child;
        child.parent = parent;

        expect(() => worker.postMessage({
            value: parent,
            eval: "postMessage(value)"
        })).toThrow();

        worker.terminate();
        done();
    });

    (isStructuredClone ? it : xit)("Should round-trip circular objects (structured clone)", (done) => {
        var worker = new Worker("./EvalWorker.js");

        var parent = { name: "parent" };
        var child = { name: "child" };
        parent.child = child;
        child.parent = parent;

        worker.postMessage({
            value: parent,
            eval: "postMessage(value)"
        });

        worker.onmessage = (msg) => {
            expect(msg.data.name).toBe("parent");
            expect(msg.data.child.name).toBe("child");
            expect(msg.data.child.parent).toBe(msg.data);
            worker.terminate();
            done();
        };
    });

    (isStructuredClone ? it : xit)("Should throw DataCloneError when posting a function", () => {
        var worker = new Worker("./EvalWorker.js");

        expect(() => worker.postMessage({ fn: () => 42 })).toThrow();

        worker.terminate();
    });

    // DOMException is [Serializable] in Web IDL: where the runtime implements
    // that, instances must survive postMessage in both directions rather than
    // degrading to plain objects. Probed, not assumed from presence: a runtime
    // can have DOMException and structuredClone without the serialization.
    var hasDOMException = typeof global.DOMException === "function";
    var serializesDOMException = isStructuredClone && hasDOMException && (function () {
        try {
            return global.structuredClone(
                new global.DOMException("probe", "AbortError")) instanceof global.DOMException;
        } catch (e) {
            return false;
        }
    })();

    (serializesDOMException ? it : xit)("Should round-trip a DOMException to the worker (structured clone)", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            value: new DOMException("boom", "AbortError"),
            eval: "postMessage(value instanceof DOMException ? value.name + '|' + value.message + '|' + value.code : 'not a DOMException')"
        });

        worker.onmessage = (msg) => {
            expect(msg.data).toBe("AbortError|boom|20");
            worker.terminate();
            done();
        };
    });

    (serializesDOMException ? it : xit)("Should round-trip a DOMException from the worker (structured clone)", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval: "postMessage(new DOMException('from worker', 'TimeoutError'))"
        });

        worker.onmessage = (msg) => {
            expect(msg.data instanceof DOMException).toBe(true);
            expect(msg.data.name).toBe("TimeoutError");
            expect(msg.data.message).toBe("from worker");
            worker.terminate();
            done();
        };
    });

    (isStructuredClone ? it : xit)("Should round-trip Date, RegExp, Map, Set, TypedArray and undefined (structured clone)", (done) => {
        var worker = new Worker("./EvalWorker.js");

        var message = {
            value: {
                date: new Date(1700000000000),
                regexp: /ab+c/gi,
                map: new Map([["key1", 1], ["key2", { nested: true }]]),
                set: new Set([1, 2, 3]),
                typedArray: new Int32Array([1, 2, 3, 4]),
                undefinedValue: undefined,
                // string form keeps the file parseable on engines without BigInt literals
                bigint: BigInt("9007199254740993")
            },
            eval: "postMessage(value)"
        };

        worker.postMessage(message);
        worker.onmessage = (msg) => {
            expect(msg.data.date instanceof Date).toBe(true);
            expect(msg.data.date.getTime()).toBe(1700000000000);
            expect(msg.data.regexp instanceof RegExp).toBe(true);
            expect(msg.data.regexp.source).toBe("ab+c");
            expect(msg.data.map instanceof Map).toBe(true);
            expect(msg.data.map.get("key1")).toBe(1);
            expect(msg.data.map.get("key2").nested).toBe(true);
            expect(msg.data.set instanceof Set).toBe(true);
            expect(msg.data.set.has(2)).toBe(true);
            expect(msg.data.typedArray instanceof Int32Array).toBe(true);
            expect(msg.data.typedArray[3]).toBe(4);
            expect("undefinedValue" in msg.data).toBe(true);
            expect(msg.data.undefinedValue).toBe(undefined);
            expect(msg.data.bigint).toBe(BigInt("9007199254740993"));
            worker.terminate();
            done();
        };
    });

    if (global.NSObject) {
        it("Should create many worker instances without throwing error", (done) => {
            var workersCount = 10;
            var messagesCount = 100;
            var allWorkersResponseCounter = 0;

            for (let id = 0; id < workersCount; id++) {
                let worker = new Worker("./EvalWorker");
                let responseCounter = 0;
                worker.onmessage = (msg) => {
                    responseCounter++;
                    if (responseCounter < messagesCount) {
                        worker.postMessage({ eval: "postMessage('pong');" });
                    }
                    else {
                        allWorkersResponseCounter += responseCounter;
                        worker.terminate();
                        if (allWorkersResponseCounter == workersCount * messagesCount) {
                            done();
                        }
                    }
                }
                worker.postMessage({ eval: "postMessage('pong');" });
            }
        });
    }

    it("Call close in onclose", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval:
                "onclose = () => {\
                postMessage('closed');\
                close();\
            };\
            close()"
        });

        var responseCounter = 0;
        worker.onmessage = (msg) => {
            expect(msg.data).toBe('closed');
            responseCounter++;
        }

        setTimeout(() => {
            expect(responseCounter).toBe(1);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    // A scope handler that throws replaces the error it was offered: the parent
    // sees the handler's own error, once, not both. Legacy runtimes (Worker not
    // yet an EventTarget — detected by the onmessage handler attribute) forward
    // both errors; each era's behavior is pinned so the suite runs on either.
    it("Throw error in onerror", (done) => {
        var worker = new Worker("./EvalWorker.js");
        var isEventTargetWorker = !!(Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(worker), "onmessage") || {}).get;
        var expectedForwards = isEventTargetWorker ? 1 : 2;

        worker.postMessage({
            eval:
                "onerror = () => {\
                postMessage('onerror called');\
                throw new Error('error');\
            };\
            throw new Error('error');"
        });

        var onerrorCounter = 0;
        worker.onerror = (err) => {
            onerrorCounter++;
        };

        var onmessageCounter = 0;
        worker.onmessage = (msg) => {
            onmessageCounter++;
        };

        setTimeout(() => {
            expect(onerrorCounter).toBe(expectedForwards);
            expect(onmessageCounter).toBe(1);
            worker.terminate();
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Should not throw errors when accessing native objects and terminating", (done) => {
        if (global.NSObject) {
            done();
            return;
        }
        let onerrorCounter = 0;
        const delay = (ms) => {
            new Promise((resolve) => setTimeout(resolve, ms));
        };
        const run = async () => {
            const newWorker = () => {
                return new Promise((resolve) => {
                    const worker = new Worker("./NativeWorkWorker.js");
                    worker.onerror = (err) => {
                        onerrorCounter++;
                        resolve(worker);
                    };
                    worker.onmessage = (result) => {
                        try {
                            if (result.data !== "success") {
                                onerrorCounter++;
                            }
                            if (onerrorCounter === 0) {
                                worker.terminate();
                            }
                        } catch (e) {
                            console.log(e);
                        }
                        resolve(worker);
                    };
                    worker.postMessage('go!');
                });
            };

            for (let i = 0; i < 5; i++) {
                const worker = await newWorker();
                await delay(50);
                // worker.terminate();
                // await delay(90);
                // worker.terminate();
            }
        };
        run().then(() => {
            expect(onerrorCounter).toBe(0);
            done();
        });
    });


    it("Should not throw errors when accessing objects instantiated from native extended classes using `extend` and terminating", (done) => {
        if (global.NSObject) {
            done();
            return;
        }
        let onerrorCounter = 0;
        const delay = (ms) => {
            new Promise((resolve) => setTimeout(resolve, ms));
        };
        const run = async () => {
            const newWorker = () => {
                return new Promise((resolve) => {
                    const worker = new Worker("./NativeClassExtendWorker.js");
                    worker.onerror = (err) => {
                        onerrorCounter++;
                        resolve(worker);
                    };
                    worker.onmessage = (result) => {
                        try {
                            if (result.data !== "success") {
                                onerrorCounter++;
                            }
                            if (onerrorCounter === 0) {
                                worker.terminate();
                            }
                        } catch (e) {
                            console.log(e);
                        }
                        resolve(worker);
                    };
                    worker.postMessage('go!');
                });
            };

            for (let i = 0; i < 5; i++) {
                const worker = await newWorker();
                await delay(50);
                // worker.terminate();
                // await delay(90);
                // worker.terminate();
            }
        };
        run().then(() => {
            expect(onerrorCounter).toBe(0);
            done();
        });
    });

    it("Should not throw errors when accessing objects instantiated from native extended classes using `NativeClass` and terminating", (done) => {
        if (global.NSObject) {
            done();
            return;
        }
        let onerrorCounter = 0;
        const delay = (ms) => {
            new Promise((resolve) => setTimeout(resolve, ms));
        };
        const run = async () => {
            const newWorker = () => {
                return new Promise((resolve) => {
                    const worker = new Worker("./NativeClassExtendNativeClassWorker.js");
                    worker.onerror = (err) => {
                        console.error(err);
                        onerrorCounter++;
                        resolve(worker);
                    };
                    worker.onmessage = (result) => {
                        try {
                            if (result.data !== "success") {
                                onerrorCounter++;
                            }
                            if (onerrorCounter === 0) {
                                worker.terminate();
                            }
                        } catch (e) {
                            console.log(e);
                        }
                        resolve(worker);
                    };
                    worker.postMessage('go!');
                });
            };

            for (let i = 0; i < 5; i++) {
                const worker = await newWorker();
                await delay(50);
                // worker.terminate();
                // await delay(90);
                // worker.terminate();
            }
        };
        run().then(() => {
            expect(onerrorCounter).toBe(0);
            done();
        });
    });

    it("If error is thrown in close() should call onerror but should not execute any other tasks ", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval:
                "onmessage = (msg) => { postMessage(msg.data + ' pong'); };\
            onerror = (err) => { postMessage('pong'); return false; };\
            onclose = () => { throw new Error('error thrown from close()'); };\
            close();"
        });

        var onerrorCalled = false;
        worker.onerror = (err) => {
            onerrorCalled = true;
        };

        var lastReceivedMessage;
        worker.onmessage = (msg) => {
            lastReceivedMessage = msg.data;
            worker.postMessage(msg.data + " ping");
        };

        setTimeout(() => {
            expect(onerrorCalled).toBe(true);
            expect(lastReceivedMessage).toBe("pong");
            worker.terminate();
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Should not throw or crash when executing too much JS inside Worker", (done) => {
        var worker = new Worker("./WorkerStressJSTest.js");
        // Worker is not guaranteed to have finished before the check for runtimes leak, so track it manually
        expectedAliveRuntimes++;
        // the specific worker will post a message if something isn't right
        worker.onmessage = (msg) => {
            // Worker sends this message when it finishes successfully
            expectedAliveRuntimes--;
            if (msg.data !== "end") {
                worker.terminate();
                done("Exception is thrown in the web worker: " + msg);
            }
        }
        worker.onerror = (e) => {
            expectedAliveRuntimes--;
            worker.terminate();
            done("Exception is thrown in the web worker: " + e);
        }

        setTimeout(() => {
            worker.terminate();
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Worker instance should not be garbage collected if the worker thread is alive", (done) => {
        var onmessageCalled = false;
        (function () {
            var w = new Worker("./EvalWorker.js");
            w.postMessage({ eval: "postMessage('pong');" });
            w.onmessage = (msg) => {
                onmessageCalled = true;
            }
        })();

        gC();

        setTimeout(() => {
            expectedAliveRuntimes++; // This nature of this test prevents us from closing the worker (we need not store a reference to it)
            expect(onmessageCalled).toBe(true);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Test worker should close and not receive messages after close() call", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval: "close(); postMessage('message after close');"
        });
        worker.postMessage({
            eval: "postMessage('pong');"
        });

        var responseCounter = 0;
        worker.onmessage = (msg) => {
            expect(responseCounter).toBe(0);
            expect(msg.data).toBe("message after close");
            responseCounter++;
        }

        setTimeout(() => {
            expect(responseCounter).toBe(1);
            worker.terminate();
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    it("Worker should fully shut down after close() without needing terminate()", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval: "close(); postMessage('closing');"
        });

        var responseCounter = 0;
        worker.onmessage = (msg) => {
            responseCounter++;
        };

        setTimeout(() => {
            worker.postMessage({ eval: "postMessage('should not arrive');" });
        }, 500);

        setTimeout(() => {
            expect(responseCounter).toBe(1);
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT + 1000);
    });

    it("Test onerror invoked for a script that has invalid syntax", (done) => {
        var worker = new Worker("./WorkerInvalidSyntax.js");

        worker.onerror = (err) => {
            worker.terminate();
            done();
        };
    });

    it("Test onerror invoked on worker scope and propagate to main's onerror when returning false", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval:
                "onerror = function(err) { \
                return false; \
            }; \
            throw 42;"
        });
        worker.onerror = (err) => {
            worker.terminate();
            done();
        }
    });

    it("Test onerror invoked on worker scope and do not propagate to main's onerror when returning true", (done) => {
        var worker = new Worker("./EvalWorker.js");

        worker.postMessage({
            eval:
                "onerror = function(err) { \
                postMessage(err); \
                return true; \
            }; \
            throw 42;"
        });

        var onErrorCalled = false;
        var onMessageCalled = false;

        worker.onerror = (err) => {
            onErrorCalled = true;
        }

        worker.onmessage = (msg) => {
            onMessageCalled = true;
        }

        setTimeout(() => {
            expect(onErrorCalled).toBe(false);
            expect(onMessageCalled).toBe(true);
            worker.terminate();
            done();
        }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
    });

    if (!global.NSObject) { // platform is Android
        it("Should run worker thread with background priority by default", (done) => {
            var worker = new Worker("./EvalWorker.js");

            worker.postMessage({
                eval: "postMessage(android.os.Process.getThreadPriority(android.os.Process.myTid()));"
            });
            worker.onmessage = (msg) => {
                expect(msg.data).toBe(10); // android.os.Process.THREAD_PRIORITY_BACKGROUND
                worker.terminate();
                done();
            };
        });

        it("Should apply the androidPriority Worker option to the worker thread", (done) => {
            var worker = new Worker("./EvalWorker.js", { androidPriority: "lowest" });

            worker.postMessage({
                eval: "postMessage(android.os.Process.getThreadPriority(android.os.Process.myTid()));"
            });
            worker.onmessage = (msg) => {
                expect(msg.data).toBe(19); // android.os.Process.THREAD_PRIORITY_LOWEST
                worker.terminate();
                done();
            };
        });

        it("Should throw when androidPriority is an unknown string", () => {
            expect(() => new Worker("./EvalWorker.js", { androidPriority: "turbo" })).toThrow();
        });

        it("Worker thread should have a working Java Looper (Handler delayed post fires)", (done) => {
            var worker = new Worker("./EvalWorker.js");

            worker.postMessage({
                eval:
                    "var handler = new android.os.Handler(android.os.Looper.myLooper());\
                    handler.postDelayed(new java.lang.Runnable({ run: () => postMessage('handler-ran') }), 50);"
            });
            worker.onmessage = (msg) => {
                expect(msg.data).toBe("handler-ran");
                worker.terminate();
                done();
            };
        });

        it("Worker thread should execute JS timers (setTimeout fires on the worker looper)", (done) => {
            var worker = new Worker("./EvalWorker.js");

            worker.postMessage({
                // the test app only wires global.setTimeout on the main thread,
                // so use the runtime's primitive directly
                eval: "__ns__setTimeout(() => postMessage('timeout-ran'), 50);"
            });
            worker.onmessage = (msg) => {
                expect(msg.data).toBe("timeout-ran");
                worker.terminate();
                done();
            };
        });

        it("Should fall back to app-root-relative worker paths when the caller has no script name (eval)", (done) => {
            // eval'd code has no script name, so the path can't be resolved
            // relative to the caller; the runtime falls back to the app root
            var worker = eval("new Worker('./shared/Workers/EvalWorker.js')");

            worker.postMessage({ eval: "postMessage('pong');" });
            worker.onmessage = (msg) => {
                expect(msg.data).toBe("pong");
                worker.terminate();
                done();
            };
        });

        it("Should support creating workers from within workers (nested workers)", (done) => {
            var worker = new Worker("./EvalWorker.js");

            // the eval'd code has no script name, so the child path is
            // resolved relative to the app root
            worker.postMessage({
                eval:
                    "var child = new Worker('./shared/Workers/EvalWorker.js');\
                    child.onmessage = (msg) => postMessage('child says: ' + msg.data);\
                    child.onerror = (e) => { postMessage('child error: ' + e.message); return true; };\
                    child.postMessage({ eval: 'postMessage(value)', value: 'hello from nested worker' });"
            });

            worker.onerror = (e) => {
                console.log("NESTED WORKER TEST ERROR: " + e.message + " | " + e.stackTrace);
                done("nested worker error: " + e.message);
            };
            worker.onmessage = (msg) => {
                expect(msg.data).toBe("child says: hello from nested worker");
                worker.terminate(); // also terminates the nested child
                done();
            };
        });

        it("Should terminate nested workers when their parent is terminated", (done) => {
            var worker = new Worker("./EvalWorker.js");

            worker.postMessage({
                eval:
                    "var child = new Worker('./shared/Workers/EvalWorker.js');\
                    child.onmessage = (msg) => postMessage(msg.data);\
                    child.postMessage({ eval: 'postMessage(java.lang.Thread.currentThread().getName())' });"
            });

            worker.onerror = (e) => {
                console.log("NESTED WORKER TEST ERROR: " + e.message + " | " + e.stackTrace);
                done("nested worker error: " + e.message);
            };
            worker.onmessage = (msg) => {
                var childThreadName = msg.data;
                // worker threads are named "W<id>: <script>"
                expect(childThreadName.indexOf("W")).toBe(0);
                worker.terminate();

                setTimeout(() => {
                    var threads = java.lang.Thread.getAllStackTraces().keySet().toArray();
                    var childAlive = false;
                    for (var i = 0; i < threads.length; i++) {
                        if (threads[i].getName() === childThreadName) {
                            childAlive = true;
                        }
                    }
                    expect(childAlive).toBe(false);
                    done();
                }, DEFAULT_TIMEOUT_BEFORE_ASSERT);
            };
        });

        it("Should terminate a worker stuck in a busy loop", (done) => {
            var worker = new Worker("./EvalWorker.js");

            worker.onmessage = (msg) => {
                expect(msg.data).toBe("looping");
                worker.terminate();

                // the runtime should remain fully functional afterwards
                var secondWorker = new Worker("./EvalWorker.js");
                secondWorker.postMessage({ eval: "postMessage('pong');" });
                secondWorker.onmessage = (innerMsg) => {
                    expect(innerMsg.data).toBe("pong");
                    secondWorker.terminate();
                    done();
                };
            };

            worker.postMessage({ eval: "postMessage('looping'); while (true) {}" });
        });
    } // platform is Android

    if (global.NSObject) { // platform is iOS
        it("Worker has active CFRunLoop that can execute NSTimer events", (done) => {
            var worker = new Worker("./EvalWorker.js");

            let messages = [];
            worker.onmessage = msg => {
                messages.push(msg.data);
            };

            worker.postMessage({ eval: `
            // older runtimes only provide setTimeout through the timers module
            if (typeof setTimeout === "undefined") {
                require("../../Infrastructure/timers");
            }
            (function func() {
                postMessage("callback");
                setTimeout(() => {
                    postMessage("callback");
                }, 500);
            })();` });

            for (var i = 0; i < 3; i++) {
                worker.postMessage({ eval: `postMessage("${i}")` });
            }

            setTimeout(() => {
                worker.postMessage({ eval: `postMessage("3")` });
                setTimeout(() => {
                    worker.terminate();
                    expect(messages).toEqual([ "callback", "0", "1", "2", "callback", "3" ]);
                    done();
                }, 100);
            }, 1000);
        });

        it("Worker should marshal callbacks on the same thread that the native block was invoked on", (done) => {
            let worker = new Worker("./EvalWorker.js");

            worker.onmessage = msg => {
                expect(msg.data.callingThreadHash).not.toEqual(msg.data.callbackThreadHash);
                expect(msg.data.callbackThreadHash).toEqual(NSThread.currentThread.hash);
                worker.terminate();
                done();
            };

            worker.postMessage({ eval: `
                let sessionConfig = NSURLSessionConfiguration.defaultSessionConfiguration;
                let queue = NSOperationQueue.mainQueue;
                let session = NSURLSession.sessionWithConfigurationDelegateDelegateQueue(sessionConfig, null, queue);
                let request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString("https://google.com"));
                request.HTTPMethod = "GET";
                let callingThreadHash = NSThread.currentThread.hash;
                let task = session.dataTaskWithRequestCompletionHandler(request, function (data, response, error) {
                    self.postMessage({
                        callingThreadHash: callingThreadHash,
                        callbackThreadHash: NSThread.currentThread.hash
                    });
                });
                task.resume();
            ` });
        });

        it("Should not crash if the worker registers a notification", (done) => {
            var worker = new Worker("./EvalWorker.js");
            worker.onmessage = (msg) => {
                worker.terminate();
                NSNotificationCenter.defaultCenter.postNotificationNameObject("MyNotification", null);
                done();
            };

            var workerScript = `
                var NotificationObserver = /** @class */ (function (_super) {
                    __extends(NotificationObserver, _super);
                    function NotificationObserver() {
                        return _super !== null && _super.apply(this, arguments) || this;
                    }
                    NotificationObserver.initWithCallback = function (onReceiveCallback) {
                        var observer = _super.new.call(this);
                        observer._onReceiveCallback = onReceiveCallback;
                        return observer;
                    };
                    NotificationObserver.prototype.onReceive = function (notification) {
                        this._onReceiveCallback(notification);
                    };
                    NotificationObserver.ObjCExposedMethods = {
                        onReceive: { returns: interop.types.void, params: [NSNotification] },
                    };
                    return NotificationObserver;
                    }(NSObject));

                    const observer = NotificationObserver.initWithCallback(notification => { });

                    NSNotificationCenter.defaultCenter.addObserverSelectorNameObject(observer, "onReceive", "MyNotification", null);

                    postMessage(self === global);
            `;

            worker.postMessage({ eval: workerScript });
        });

        it("no crash during or after runtime teardown on iOS", (done) => {
            // reduce number of workers on older (32-bit devices) to avoid sporadic failures due to timeout
            const numWorkers = (interop.sizeof(interop.types.id) == 4) ? 4 : 10;
            const timeout = DEFAULT_TIMEOUT_BEFORE_ASSERT * 3.5;

            let messageProducerTimeout = true;
            let iteration = 0;
            const produceMessageInLoop = () => {
                NSNotificationCenter.defaultCenter.postNotificationNameObjectUserInfo('send-to-worker', { iteration }, null);
                iteration++;
                // Prevent against rescheduling after we've been stopped
                if (messageProducerTimeout) {
                    messageProducerTimeout = setTimeout(produceMessageInLoop, 1);
                }
            };
            produceMessageInLoop();

            let onCloseEvents = 0;
            let onStartEvents = 0;
            for (let i = 0; i < numWorkers; i++) {
                const worker = new Worker("./TeardownCrashWorker.js");
                worker.onmessage = (msg) => {
                    if (msg.data === "closing") {
                        onCloseEvents++;
                    }
                    else if (msg.data === "starting") {
                        onStartEvents++;
                        worker.postMessage(i);
                    }
                }
            }

            setTimeout(() => {
                clearTimeout(messageProducerTimeout);
                // Signal we've stopped to prevent against rescheduling by an already queued timer tick
                messageProducerTimeout = null;

                expect(onStartEvents).toBeGreaterThan(0, `At least 1 worker should have started in ${timeout} ms`);
                expect(onCloseEvents).toBeGreaterThan(0, `At least 1 worker should have finished in ${timeout} ms`);
                done();
            }, timeout);
        });

        if (global.TNSRuntime) { // JavaScriptCore-based runtime only
            it("Check for leaked runtimes", function (done) {
                setTimeout(() => {
                    const runtimesCount = TNSRuntime.runtimes().count;
                    expect(runtimesCount).toBe(expectedAliveRuntimes, `Found ${runtimesCount} runtimes alive. Expected ${expectedAliveRuntimes}.`);
                    done();
                }, 1000);
            });
        }

    } // platform is iOS

    function generateRandomString(strLen) {
        var chars = "abcAbc defgDEFG 1234567890 ";
        var len = chars.length;
        var str = "";

        for (var i = 0; i < strLen; i++) {
            str += chars[getRandomInt(0, len - 1)];
        }

        return str;
    }

    //
    // Returns a random integer between min (inclusive) and max (inclusive)
    // Using Math.round() will give you a non-uniform distribution!
    //
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
});
