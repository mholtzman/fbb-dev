var express = require("express"),
    parser = require("body-parser"),
    aws = require("aws-sdk"),
    players = require("./routes/players");

var app = express();
var port = process.env.PORT || 9080;

//app.use(parser.json());

/*app.use(function (req, res) {
    var db = new aws.DynamoDB();

    var params = {
        TableName: 'players',
        Item: {
            player_id: {
                S: req.body.player_id
            },
            first_name: {
                S: req.body.first_name
            },
            last_name: {
                S: req.body.last_name
            },
            position: {
                S: req.body.position
            },
            projection: {
                M: {
                    hr: {
                        N: req.body.projection.hr
                    },
                    rbi: {
                        N: req.body.projection.avg
                    },
                    avg: {
                        N: req.body.projection.avg
                    }
                }
            }
        }
    };

    db.deleteItem({
        TableName: 'players',
        Key: {
            player_id: {
                S: req.body.player_id
            }
        }
    }, function(err, data) {
        if (err) {
            console.log(err);
            res.end("error!");
        }
        else {
            console.log("Player deleted successfully!");
            db.putItem(params, function(err, data) {
                if (err) {
                    console.log(err);
                    res.end("error adding player!");
                }
                else {
                    res.end("Player added successfully!");
                }
            });
        }
    });
});*/

app.use('/players', players);

app.listen(port, function() {
    console.log("server started listening on port: " + port);
});