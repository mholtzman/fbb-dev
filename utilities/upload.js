var fs = require('fs'),
    parse = require('csv-parse'),
    aws = require('aws-sdk'),
    _ = require ('underscore'),
    _str = require('underscore.string');

var credentials = new aws.SharedIniFileCredentials({ profile: 'fbb' });
aws.config.credentials = credentials;
aws.config.update({ region: 'us-east-1' });

function createPlayerItemRequest(playerData) {
    var firstName = playerData.first_name;
    var lastName = playerData.last_name;
    return {
        PutRequest: {
            Item: {
                player_id: {
                    S: getPlayerId(firstName, lastName)
                },
                first_name: { S: firstName },
                last_name: { S: lastName },
                positions: { SS: playerData.positions.split(",") },
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

function uploadPlayerData(playerData) {
    // data will be an array of player objects
    var db = new aws.DynamoDB();

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
                    batchParams.RequestItems.players.push(createPlayerItemRequest(playerData.shift()));
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

var upload = function(fileStream) {
    fileStream.pipe(parse({columns: true}, function(err, data) {
        if (err) console.log('Error: ' + err);
        else {
            console.log('Successfully parsed uploaded data!');

            // DEBUG --> console.log(data);
            uploadPlayerData(data);
        }
    }));
};

// convert to lowercase, remove all periods, then capitalize (for later converting to underscores)
function normalize_id(str) {
    return _str.replaceAll(_str.capitalize(str.toLowerCase()), "\\.", "");
}

var getPlayerId = function(firstName, lastName) {
    return _str.underscored(normalize_id(firstName) + (lastName ? normalize_id(lastName) : ""));
};

//exports.uploadProjections = upload;
exports.getPlayerId = getPlayerId;

/*var uploadFile = process.argv[2];
if (uploadFile) {
    var file = fs.createReadStream(uploadFile);
    file.on('error', function(err) {
        console.log("error opening stream: " + err);
    });

    upload(file);
} else {
    console.log("Enter a file to upload!");
}*/



