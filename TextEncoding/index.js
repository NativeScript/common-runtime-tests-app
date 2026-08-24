// Entry point for the WHATWG Encoding Standard suites. Each file gates itself
// on the API it covers, so both can be required unconditionally.
require("./Encoding");
require("./Base64");
