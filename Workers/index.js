describe("TNS Workers", function () {
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 4000;
    });

    afterEach(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });

    describe("Worker Object Initialization", function () {
        it("Should throw exception when no parameter is passed", function () {
            var exceptionThrown = false;

            try {
                new Worker();
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);
        });

        it("Should throw exception when script does not exist", function () {
            var exceptionThrown = false;

            try {
                new Worker("./idonot-exist.js");
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);
        });

        it("Should throw exception when parameter is not a proper string", function () {
            var exceptionThrown = false;

            try {
                new Worker({ filename: "./WorkerCommon.js" });
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);

            exceptionThrown = false;

            try {
                new Worker((function () {
                    function a() {

                    }
                } ()));
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);
        });

        it("Should throw exception when not invoked as constructor", function () {
            var exceptionThrown = false;

            try {
                Worker();
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);

            exceptionThrown = false;

            try {
                Worker("./WorkerCommon.js");
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);
        });
    });

    describe("Workers Messaging", function () {
        it("Should throw exception when Worker.postMessage is called with invalid arguments", function () {
            var exceptionThrown = false;

            var a = new Worker("./WorkerWithOnMessage.js");

            try {
                a.postMessage();
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);

            exceptionThrown = false;

            try {
                a.postMessage("Message: 1", "Message2");
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(true);

            a.terminate();
        });

        it("Send a message from worker -> worker scope and receive back the same message", function (done) {
            var a = new Worker("./WorkerWithOnMessage.js");

            var inputMessage = "This is a very elaborate message that the worker1 will not know of.";

            a.postMessage(inputMessage);

            var worker1Sig = "WorkerWithOnMessage-gg";

            a.onmessage = function (msg) {
                expect(msg).toBe(inputMessage + worker1Sig);
                done();
                a.terminate();
            }
        });

        it("Send a LONG message from worker -> worker scope and receive back the same LONG message", function (done) {
            var a = new Worker("./WorkerWithOnMessage.js");

            var inputMessage = generateRandomString(1000);

            a.postMessage(inputMessage);

            var worker1Sig = "WorkerWithOnMessage-gg";

            a.onmessage = function (msg) {
                expect(msg).toBe(inputMessage + worker1Sig);
                done();
                a.terminate();
            }
        });

        it("Send an object and receive back the same object", function (done) {
            var a = new Worker("./WorkerWithOnMessage.js");

            var obj = { data: "A message from main", sig: "WorkerWithOnMessage-gg", arbitraryNumber: 42 };
            a.postMessage(obj);

            a.onmessage = function (msg) {
                expect(msg.data).toBe("A message from main");
                expect(msg.sig).toBe("WorkerWithOnMessage-gg");
                expect(msg.arbitraryNumber).toBe(42);
                done();
                a.terminate();
            }
        });

        it("Send many objects from worker Object", function (done) {
            var a = new Worker("./WorkerWithOnMessage.js");

            var objects = [];
            for (var i = 0; i < 100; i++) {
                objects.push({ i: i, data: generateRandomString(100), num: 123456.22 });
            }

            setTimeout(function () {
                // if all messages have been sent
                if (j == 100) {
                    done();
                    a.terminate();
                }

                a.terminate();
            }, 350);

            var j;

            for (j = 0; j < 100; j++) {
                a.postMessage(objects[j]);
            }
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

        /**
         * Returns a random integer between min (inclusive) and max (inclusive)
         * Using Math.round() will give you a non-uniform distribution!
         */
        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
    });

    describe("Worker Object Lifecycle", function () {
        it("Worker should not throw exception when created successfully", function () {
            var exceptionThrown = false;

            try {
                var worker = new Worker("./WorkerWithOnMessage.js");

                if (!worker.postMessage) {
                    throw "worker.postMessage did not exist";
                } else if (!worker.terminate) {
                    throw "worker.terminate did not exist";
                }

                worker.terminate();
            } catch (e) {
                exceptionThrown = true;
            }

            expect(exceptionThrown).toBe(false);
        });

        it("Terminate worker prematurely while it has queued messages", function (done) {
            var worker = new Worker("./WorkerCommon.js");

            setTimeout(function () {
                for (var i = 0; i < 1000; i++) {
                    worker.postMessage("NS stands for NativeScript");
                }

                worker.terminate();
                done();
            }, 1000); // provide enough time for the worker to initialize before spamming it
        });

        it("Should not throw or crash when executing too much JS inside Worker", function (done) {
            var exceptionThrown = false;

            var worker = new Worker("./WorkerStressJSTest.js");

            // the specific worker will post a message if something isn't right
            worker.onmessage = function (msg) {
                exceptionThrown = true;
            }

            setTimeout(function () {
                worker.terminate();

                expect(exceptionThrown).toBe(false);
                done();
            }, 1000);
        });
    });

    describe("Worker Scope Closing", function () {
        it("Test worker should close and not postMessage after close() call", function (done) {
            var messageReceived = false;

            var worker = new Worker("./WorkerClose.js");

            worker.postMessage("close");

            worker.onmessage = function (msg) {
                messageReceived = true;
            }

            setTimeout(function () {
                expect(messageReceived).toBe(false);
                done();
            }, 1000);
        });

        it("Test worker should close and not receive messages after close() call", function (done) {
            var messageReceived = false;

            var worker = new Worker("./WorkerClose.js");

            worker.postMessage("close");
            worker.postMessage("ping");

            worker.onmessage = function (msg) {
                if (msg == "pong") {
                    messageReceived = true;
                }
            }

            setTimeout(function () {
                expect(messageReceived).toBe(false);
                done();
            }, 1000);
        });
    });

    describe("Workers Error Handling", function () {
        it("Test onerror invoked for a script that has invalid syntax", function (done) {
            var worker = new Worker("./WorkerInvalidSyntax.js");

            worker.onerror = function (err) {
                done();
                worker.terminate();
                return true;
            };
        });

        it("Test onerror invoked on worker scope and propagate to main's onerror when returning false", function (done) {
            var worker = new Worker("./WorkerWithOnError.js");

            worker.postMessage("with onerror returning false");

            worker.onerror = function (err) {
                done();
                worker.terminate();
                return true;
            }
        });

        it("Test onerror invoked on worker scope and do not propagate to main's onerror when returning true", function (done) {
            var worker = new Worker("./WorkerWithOnError.js");

            worker.postMessage("with onerror returning true");

            worker.onerror = function (err) {
                worker.terminate();
                return true;
            }

            worker.onmessage = function (msg) {
                done();
                worker.terminate();
            }
        });
    });
});
