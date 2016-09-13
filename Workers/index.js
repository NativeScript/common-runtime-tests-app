describe("TNS Workers", function () {
    var originalTimeout;

    beforeEach(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 3000;
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
            __log("Should throw exception when Worker.postMessage is called with invalid arguments");
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
                a.postMessage({ data: "message" });
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
            __log("Send a message from worker -> worker scope and receive back the same message");
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
            __log("Send a LONG message from worker -> worker scope and receive back the same LONG message");
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
    });

    describe("Worker Scope Closing", function () {

    });

    describe("Workers Error Handling", function () {

    });
});
