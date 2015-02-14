var express = require("express");

var app = express();
var port = process.env.PORT || 9080;

app.get('/', function(req, resp) {
    resp.end('Hello, world!');
});

app.listen(port, function() {
    console.log("server started listening on port: " + port);
});