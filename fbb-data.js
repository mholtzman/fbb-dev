var express = require("express"),
    path = require('path'),
    parser = require("body-parser"),
    aws = require("aws-sdk"),
    _ = require("underscore"),
    players = require("./routes/players"),
    projections = require("./routes/projections");

var app = express();
var port = process.env.PORT || 9080;

app.set('view engine', 'jade');
app.use(express.static(path.join(__dirname, 'public')));

// TODO load the player universe and cache it -- updates to the player universe will need a restart of the server

app.use('/players', players);
app.use('/projections', projections);

app.listen(port, function() {
    console.log("server started listening on port: " + port);
});