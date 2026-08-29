onmessage = function (msg) {
    const MyHashMap = java.util.HashMap('MyHashMap', {})
    try {
        const myHashMap = new MyHashMap();
        postMessage("success");
    } catch (e) {
        console.log(e);
        postMessage("failed");
    }
}
