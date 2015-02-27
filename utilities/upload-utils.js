var parse = require('csv-parse'),
    transform = require('stream-transform'),
    aws = require('aws-sdk'),
    _ = require ('underscore'),
    _str = require('underscore.string');

function createPlayerItemRequest(playerData, site) {
    var positionMap = {
        M: {}
    };

    positionMap.M[site] = { SS: playerData.positions.split(",") };

    return {
        PutRequest: {
            Item: {
                player_id: { S: playerData.player_id },
                first_name: { S: playerData.first_name },
                last_name: { S: playerData.last_name },
                positions: positionMap,
                team: { S: playerData.team }
                /*projection: {
                    M: {
                        pa: { N: playerData.PA },
                        ab: { N: playerData.AB },
                        h: { N: playerData.H },
                        '2b': { N: playerData['2B'] },
                        '3b': { N: playerData['3B'] },
                        hr: { N: playerData.HR },
                        r: { N: playerData.R },
                        rbi: { N: playerData.RBI },
                        bb: { N: playerData.BB },
                        so: { N: playerData.SO },
                        hbp: { N: playerData.HBP },
                        sb: { N: playerData.SB },
                        cs: { N: playerData.CS }
                    }
                }*/
            }
        }
    };
}

function uploadPlayerData(playerData, site) {
    // data will be an array of player objects
    var db = new aws.DynamoDB({ region: 'us-east-1' });

    // check throughput of the table so we don't exceed it when batching
    db.describeTable({ TableName: 'players' }, function(err, data) {
        if (err) {
            console.log("error: " + err);
            return;
        }

        var writeThroughput = data.Table.ProvisionedThroughput.WriteCapacityUnits;
        if (writeThroughput > 0) {
            var leftToProcess = playerData.length;

            // batch write item has a max of 25 records at a time
            var batch = 0;
            while (leftToProcess > 0) {
                 var batchParams = {
                    RequestItems: {
                        players: []
                    },
                    ReturnConsumedCapacity: 'TOTAL'
                };

                var batchSize = Math.min(writeThroughput, leftToProcess);
                for (var i = 0; i < batchSize; i++) {
                    batchParams.RequestItems.players.push(createPlayerItemRequest(playerData.shift(), site));
                    leftToProcess--;
                }

                // console.log("ready to call with " + batchParams.RequestItems.players.length + " items, " + leftToProcess + " left");

                var writeItems = _.bind(function() {
                    var players = this.RequestItems.players;

                    //console.log("writing first item: " + JSON.stringify(this.RequestItems.players[0], undefined, 2));

                    db.batchWriteItem(this, function(err, data) {
                        if (err) { 
                            console.log('Error: ' + err);
                            return;
                        } else {
                            var numNotProcessed = 0;
                            if (data.UnprocessedItems["players"]) {
                                numNotProcessed = data.UnprocessedItems["players"].length;
                            }

                            console.log('Wrote ' + (players.length - numNotProcessed) + ' records (' + numNotProcessed + ' not processed); capacity used: ' + data.ConsumedCapacity[0].CapacityUnits);
                        }
                    });
                }, batchParams);

                _.delay(writeItems, ++batch * 1100);
            }
        } else {
            console.log("couldn't determine write throughput!");
            return;
        }
    });
}

var upload = function(stream, site) {
    stream.pipe(parse({columns: true}, function(err, data) {
        if (err) {
            console.log('error: ' + err);
        }
        else {
            console.log('cuccessfully parsed uploaded data!');


            console.log("uploading " + site + " data");
            uploadPlayerData(data, site);
        }
    }));
};

module.exports = upload;


