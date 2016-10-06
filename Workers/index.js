describe("TNS Workers", () => {
    var originalTimeout;

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 4000;
    });

    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    var gC = global.NSObject ? __collect : gc;

    describe("Worker Object Initialization", () => {
        it("Should throw exception when no parameter is passed", () => {
            expect(() => new Worker()).toThrow();
        });

        xit("Should call worker.onerror when script does not exist", (done) => {
            var worker = new Worker("./idonot-exist.js");
            worker.onerror = (e) => {
                expect(e).not.toEqual(null);
                done();
            }
        });

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
    });

    describe("Workers Messaging", () => {
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
                value: generateRandomString(10000),
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
                value: { data: "A message from main", arbitraryNumber: 42 },
                eval: "postMessage(value);"
            }

            a.postMessage(message);
            a.onmessage = (msg) => {
                expect(msg.data.data).toBe(message.value.data);
                expect(msg.data.arbitraryNumber).toBe(message.value.arbitraryNumber);
                a.terminate();
                done();
            }
        });


        it("Send many objects from worker object without waiting for response and terminate", () => {
            var a = new Worker("./EvalWorker.js");
            for (var i = 0; i < 10000; i++) {
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
            }, 1000);
        });

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

    describe("Worker Object Lifecycle", () => {
        it("Worker should not throw exception when created successfully", () => {
            var worker = new Worker("./EvalWorker.js");

            expect(worker.postMessage).toBeDefined();
            expect(worker.terminate).toBeDefined();
            worker.terminate();
        });

        it("Should not throw or crash when executing too much JS inside Worker", (done) => {
            var worker = new Worker("./WorkerStressJSTest.js");
            // the specific worker will post a message if something isn't right
            worker.onmessage = (msg) => {
                worker.terminate();
                done("Exception is thrown in the web worker: " + msg);
            }
            worker.onerror = (e) => {
                worker.terminate();
                done("Exception is thrown in the web worker: " + e);
            }

            setTimeout(() => {
                worker.terminate();
                done();
            }, 1000);
        });

        it("If worker instance is garbage collected, onmessage should not be called", (done) => {
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
                expect(onmessageCalled).toBe(false);
                done();
            }, 1000);
        });
    });

    describe("Worker Scope Closing", () => {
        it("Test worker should close and not receive messages after close() call", (done) => {
            var messageReceived = false;
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
            }, 1000);
        });
    });

    describe("Workers Error Handling", () => {

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
            }, 1000);
        });
    });
});
