var express = require('express'),
    aws = require('aws-sdk'),
    _ = require('underscore');

var router = express.Router();

function aggregateProjections(projections) {
    var numProjections = projections.length;

    return _.chain(projections)
            .reduce(function(totals, projection) {
                for (var key in projection) {
                    totals[key] = (key in totals ? totals[key] : 0) + Number(projection[key].N);
                }

                return totals;
            }, {})
            .map(function(num, key) { 
                return [key, num / numProjections]; 
            })
            .object()
            .value();
}

router.get('/', function(req, resp) {
    var sites = _.flatten([req.query.site]);
    var db = new aws.DynamoDB({ region: 'us-east-1' });
    var allPlayerData = {};

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

                allPlayerData[player.player_id.S] = newPlayer;
            });

            console.log("all player data loaded!");

            db.scan({ TableName: "projections" }, function(err, data) {
                if (err) {
                    console.error("error loading projections: ");
                    resp.end();
                } else {
                    var responseData = [];

                    // join the player data with the projection data
                    data.Items.forEach(function(projectionData) {
                        var playerId = projectionData.player_id.S;
                        var player = allPlayerData[playerId];

                        // first, get the set of requested projections
                        var requestedProjectionTypes = _.intersection(sites, _.keys(projectionData));

                        // then pull out the requested projections
                        var requestedProjections =
                            _.chain(projectionData)
                            .pick(requestedProjectionTypes)
                            .map(function(val) {
                                return val.M;
                            }).value();

                        // then aggregate all the data
                        player.projections = aggregateProjections(requestedProjections);

                        responseData.push(player);
                    });

                    resp.status(200).json({ data: responseData });
                }
            });
        }
    });
});

module.exports = router;