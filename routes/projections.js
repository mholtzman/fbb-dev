var express = require('express'),
    aws = require('aws-sdk');

var router = express.Router();

router.get('/', function(req, resp) {
    var db = new aws.DynamoDB({ region: 'us-east-1' });
    var playerData = {};

    db.scan({ TableName: "players" }, function(err, data) {
        if (err) {
            console.error("couldn't load any player data!");
            resp.end();
        }
        else {
            data.Items.forEach(function(player) {
                var newPlayer = {
                    name: player.first_name.S + " " + player.last_name.S,
                    team: player.team.S,
                    positions: {},
                    projections: {}
                };

                for (var positionSet in player.positions.M) {
                    newPlayer.positions[positionSet] = player.positions.M[positionSet].SS
                }

                playerData[player.player_id.S] = newPlayer;
            });

            console.log("all player data loaded!");

            db.scan({ TableName: "projections" }, function(err, data) {
                if (err) {
                    console.error("error loading projections: ");
                    resp.end();
                } else {
                    data.Items.forEach(function(player) {
                        var playerId = player.player_id.S;

                        for (var projectionKey in player) {
                            if (projectionKey !== "player_id") {
                                playerData[playerId].projections[projectionKey] = {};

                                var projectionData = player[projectionKey].M;
                                for (var stat in projectionData) {
                                    playerData[playerId].projections[projectionKey][stat] = Number(projectionData[stat].N);
                                }
                            }
                        }
                    });

                    resp.render('projections', { players: playerData });
                }
            });
        }
    });
});

module.exports = router;