onmessage = function (msg) {
    var MyURL = /** @class */ (function (_super) {
        __extends(MyHashMap, _super);
        function MyHashMap(arg) {
            var _this = _super.call(this, arg) || this;
            return global.__native(_this);
        }
        return MyHashMap;
    }(java.util.HashMap));
    try {
        const myHashmap = new MyHashMap();
        postMessage("success");
    } catch (e) {
        console.log(e);
        postMessage("failed");
    }
}
