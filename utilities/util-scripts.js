var fs = require('fs'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    stringify = require('csv-stringify'),
    _ = require ('underscore'),
    _str = require('underscore.string'),
    utils = require('./data-utils');

/*var params = {
    ExpressionAttributeValues: { ":dh": { S: "DH" } },
    FilterExpression: "contains(positions, :dh)",
    TableName: 'players'
};

var db = new aws.DynamoDB({ region: 'us-east-1' });

db.scan(params, function(err, data) {
    if (err) {
        console.error("error: " + err);
    } else {
        data.Items.forEach(function(item) {
            var positions = item.positions.SS;

            if (positions.length > 1) {
                positions.splice(positions.indexOf("DH"), 1);
            }

            console.log(item.player_id.S + ": " + positions);

            var params = {
                TableName: 'players',
                Key: {
                    player_id: {
                        S: item.player_id.S
                    },
                },
                UpdateExpression: 'set positions = :new_pos',
                ExpressionAttributeValues: {
                    ":new_pos": { SS: positions }
                }
            };

            db.updateItem(params, function(err, data) {
                if (err) {
                    console.error("error: " + err);
                }
            });
        });
    }
});*/

// returns a stream
var getPlayerNames = function(uploadFile, callback, batters, pitchers) {
    if (uploadFile) {
        var file = loadCSV(uploadFile);
        var parser = parse({ columns: true });

        var players = [];

        var transformer = transform(function(data) {
            players.push(utils.getPlayerId(data.first_name, data.last_name));
        });

        transformer.on('finish', function() {
            callback(null, players);
        });

        file.pipe(parser).pipe(transformer);
    } else {
        console.log("Enter a CSV file to read!");
    }
};

// in order of increasing "value" to determine which position a player should be considered as
var POSITIONS = ["DH", "1B", "RF", "LF", "CF", "3B", "2B", "SS", "C"];

var byPosition = function(p1, p2) {
    return POSITIONS.indexOf(p2) - POSITIONS.indexOf(p1);
}

function normalizePositions(positions) {
    // change RF,LF,CF positions to OF
    var normalizedPosition = _str.replaceAll(_str.replaceAll(_str.replaceAll(positions, "LF", "OF"), "RF", "OF"), "CF", "OF");

    // change slashes to commas
    normalizedPosition = _str.replaceAll(normalizedPosition, '/', ',');

    // then sort and turn back into a string
    return _.uniq(normalizedPosition.split(",").sort(byPosition), true).join(",");
}

// first file is a list of players of interest, second file is another file where all records
// corresponding to players not in the first file will be removed
var createRecordsFromMasterSet = function(fileToKeep, fileToParse, callback, playersToKeep) {
    if (fileToKeep && fileToParse) {
        getPlayerNames(fileToKeep, function(err, players) {
            if (err) {
                return console.error("error parsing file to keep: " + err);
            } else {
                var file = loadCSV(fileToParse);
                var parser = parse();
                var toString = stringify();

                var playerData = [];
                var ignored = [];

                var transformer = transform(function(data) {
                    var playerId = utils.getPlayerId(data[0]);
                    if (_.contains(players, playerId)) {
                        for (var i = 3; i < data.length; i++) {
                            data[i] = normalizePositions(data[i]);
                        }

                        return data;
                    } else {
                        ignored.push(playerId);
                    }
                });

                transformer.on('finish', function() {
                    console.log("parsed and kept " + players.length + " player records, ignored " + ignored.length);
                });

                var output = writeCSV('2015-master.csv');

                file.pipe(parser).pipe(transformer).pipe(toString).pipe(output);
            }
        });
    } else {
        console.log("Enter two CSV files to read!");
    }
}

var loadCSV = function(uploadFile) {
    var file = fs.createReadStream(uploadFile);
    file.on('error', function(err) {
        console.log("error opening stream: " + err);
    });

    return file;    
};

var writeCSV = function(fileToWrite) {
    var file = fs.createWriteStream(fileToWrite);
    file.on('error', function(err) {
        console.log("error opening stream: " + err);
    });

    return file;    
};


exports.getPlayerNames = getPlayerNames;

var KNOWN_SCRIPTS = ["get-player-names","create-master-list","write-file"];

var scriptName = process.argv[2];
if (scriptName) {
    switch (scriptName) {
        case KNOWN_SCRIPTS[0]: {
            return getPlayerNames(process.argv[3], function(err, data) {
                if (err) {
                    console.error("error: " + err);
                    return;
                }

                console.log("file contains " + data.length + " players");
            });
        }
        case KNOWN_SCRIPTS[1]: {
            return createRecordsFromMasterSet(process.argv[3], process.argv[4]);
        }
        case KNOWN_SCRIPTS[2]: {
            var output = writeCSV('..\\data\\test-file.csv');
            output.write('testing!');
            output.end();
            return;
        }
        default: {
            console.error("unknown script! options: " + KNOWN_SCRIPTS.toString());
        }
            
    }
} else {
    console.log("pick a script to run!");
}
