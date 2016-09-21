describe("TNS Workers", () => {
    var originalTimeout;

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 4000;
    });

    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    describe("Worker Object Initialization", () => {
        it("Should throw exception when no parameter is passed", () => {
            expect(() => new Worker()).toThrow();
        });

        it("Should call worker.onerror when script does not exist", (done) => {
            var worker = new Worker("./idonot-exist.js");
            worker.onerror = (e) => {
                expect(e).not.toEqual(null);
                done();
            }
        });

        it("Should throw exception when parameter is not a proper string", () => {
            // with object parameter
            expect(() => new Worker({ filename: "./WorkerCommon.js" })).toThrow();
            // with number parameter
            expect(() => new Worker(5) ).toThrow();
            // with more complex parameter
            expect(() => {
                new Worker((() => {
                    function a() {}
                })())
            }).toThrow();
        });

        it("Should throw exception when not invoked as constructor", () => {
            expect(() => { Worker("./WorkerCommon.js"); }).toThrow();
        });

        it("Should be terminated without error", () => {
            var worker = new Worker("./WorkerCommon.js");
            worker.terminate();
        });
    });

    describe("Workers Messaging", () => {
        it("Should throw exception when Worker.postMessage is called without arguments", () => {
            var w = new Worker("./WorkerWithOnMessage.js");
            expect(() => { w.postMessage() }).toThrow();
            w.terminate();
        });

        it("Should throw exception when Worker.postMessage is called more than one argument", () => {
            var w = new Worker("./WorkerWithOnMessage.js");
            expect(() => { w.postMessage("Message: 1", "Message2") }).toThrow();
            w.terminate();
        });

        it("Send a message from worker -> worker scope and receive back the same message", (done) => {
            var a = new Worker("./WorkerWithOnMessage.js");
            var inputMessage = "This is a very elaborate message that the worker1 will not know of.";
            var worker1Sig = "WorkerWithOnMessage-gg";

            a.postMessage(inputMessage);
            a.onmessage =  (msg) => {
                expect(msg).toBe(inputMessage + worker1Sig);
                a.terminate();
                done();
            }
        });

        it("Send a LONG message from worker -> worker scope and receive back the same LONG message", (done) => {
            var a = new Worker("./WorkerWithOnMessage.js");
            var inputMessage = generateRandomString(1000);
            var worker1Sig = "WorkerWithOnMessage-gg";

            a.postMessage(inputMessage);
            a.onmessage = (msg) => {
                expect(msg).toBe(inputMessage + worker1Sig);
                a.terminate();
                done();
            }
        });

        it("Send an object and receive back the same object", (done) => {
            var a = new Worker("./WorkerWithOnMessage.js");
            var obj = { data: "A message from main", sig: "WorkerWithOnMessage-gg", arbitraryNumber: 42 };

            a.postMessage(obj);
            a.onmessage = (msg) => {
                expect(msg.data).toBe(obj.data);
                expect(msg.sig).toBe(obj.sig);
                expect(msg.arbitraryNumber).toBe(obj.arbitraryNumber);
                a.terminate();
                done();
            }
        });

        it("Send many objects from worker Object", (done) => {
            var a = new Worker("./WorkerWithOnMessage.js");
            for (var i = 0; i < 100; i++) {
                a.postMessage({ i: i, data: generateRandomString(100), num: 123456.22 });
            }
        }, 300);

        function generateRandomString(strLen) {
            var chars = "abcAbc defgDEFG 1234567890 ";
            var len = chars.length;
            var str = "";

            for (var i = 0; i < strLen; i++) {
                str += chars[getRandomInt(0, len - 1)];
            }

            return str;
        }

        /**
         * Returns a random integer between min (inclusive) and max (inclusive)
         * Using Math.round() will give you a non-uniform distribution!
         */
        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
    });

    describe("Worker Object Lifecycle", () => {
        it("Worker should not throw exception when created successfully", () => {
            var worker = new Worker("./WorkerWithOnMessage.js");

            if (!worker.postMessage) {
                throw "worker.postMessage did not exist";
            } else if (!worker.terminate) {
                throw "worker.terminate did not exist";
            }

            worker.terminate();
        });

        it("Terminate worker prematurely while it has queued messages", (done) => {
            var worker = new Worker("./WorkerCommon.js");
            for (var i = 0; i < 1000; i++) {
                worker.postMessage("NS stands for NativeScript");
            }

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
    });

    describe("Worker Scope Closing", () => {
        it("Test worker should close and not postMessage after close() call", (done) => {
            var messageReceived = false;
            var worker = new Worker("./WorkerClose.js");

            worker.postMessage("close");
            worker.onmessage = (msg) => {
                messageReceived = true;
            }

            setTimeout(() => {
                worker.terminate();
                expect(messageReceived).toBe(false);
                done();
            }, 1000);
        });

        it("Test worker should close and not receive messages after close() call", (done) => {
            var messageReceived = false;
            var worker = new Worker("./WorkerClose.js");

            worker.postMessage("close");
            worker.postMessage("ping");
            worker.onmessage = (msg) => {
                if (msg == "pong") {
                    messageReceived = true;
                }
            }

            setTimeout(() => {
                worker.terminate();
                expect(messageReceived).toBe(false);
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
            var worker = new Worker("./WorkerWithOnError.js");

            worker.postMessage("with onerror returning false");
            worker.onerror = (err) => {
                worker.terminate();
                done();
            }
        });

        it("Test onerror invoked on worker scope and do not propagate to main's onerror when returning true", (done) => {
            var worker = new Worker("./WorkerWithOnError.js");

            worker.postMessage("with onerror returning true");
            worker.onerror = (err) => {
                worker.terminate();
                done(new Error("Should not run worker.onerror callback"));
            }

            worker.onmessage = function (msg) {
                worker.terminate();
                done();
            }
        });
    });
});
