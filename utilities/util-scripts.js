var fs = require('fs'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    stringify = require('csv-stringify'),
    request = require('request'),
    cheerio = require('cheerio'),
    _ = require ('underscore'),
    Q = require('q'),
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

var normalizeColumns = function(cols) {
    for (var i = 0; i < cols.length; i++) {
        if (_str.contains(cols[i], "pos")) {
            cols[i] = "positions";
        }
    }

    return cols;
}

// adds player IDs, removes specific "OF" positions, removes DH unless it's the only position, and sorts positions
var normalizeFile = function(uploadFile) {
    if (uploadFile) {
        var file = loadCSV(uploadFile);
        var parser = parse({ columns: normalizeColumns });
        var stringer = stringify({ header: true });

        var players = [];

        var transformer = transform(function(player) {
            player.playerId = utils.getPlayerId(player.first_name, player.last_name);
            player.positions = normalizePositions(player.positions);
                
            return player;
        });

        file.pipe(parser).pipe(transformer).pipe(stringer).pipe(writeCSV('..\\data\\2015-espn-parsed.csv'));
    } else {
        console.log("Enter a CSV file to read!");
    }
};

function isPositionPlayer(positions) {
    return !_str.include(positions, "SP") && !_str.include(positions, "RP");
}

// in order of increasing "value" to determine which position a player should be considered as
var POSITIONS = ["DH", "1B", "RF", "LF", "CF", "3B", "2B", "SS", "C"];
var OF_POSITIONS = ["RF", "LF", "CF"];

var byPosition = function(p1, p2) {
    return POSITIONS.indexOf(p2) - POSITIONS.indexOf(p1);
}

function normalizePositions(positions) {
    // change slashes to commas
    var normalizedPosition = _str.replaceAll(positions, '/', ',');

    // turn into array for processing
    normalizedPosition = normalizedPosition.split(",");

    // change RF,LF,CF positions to OF
    if (_.some(normalizedPosition, function(position) {
        return _.contains(OF_POSITIONS, position);
    })) {
        normalizedPosition = _.without(normalizedPosition, OF_POSITIONS);
        normalizedPosition.push("OF");
    }

    // remove DH unless it's the only positions
    if (normalizedPosition.length > 1) {
        normalizedPosition = _.without(normalizedPosition, "DH");
    }

    // then sort and turn back into a string
    return normalizedPosition.sort(byPosition).join(",");
}

// first file is a list of players of interest, second file is another file where all records
// corresponding to players not in the first file will be removed
/*var mergeData = function(fileToKeep, fileToParse, callback, playersToKeep) {
    if (fileToKeep && fileToParse) {
        getPlayerNames(fileToKeep, function(err, players) {
            if (err) {
                return console.error("error parsing file to keep: " + err);
            } else {
                var file = loadCSV(fileToParse);
                var parser = parse({ columns: true });
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
}*/

var scrapeESPN = function(outputFile) {
    var baseUrl = "http://games.espn.go.com/flb/tools/projections?display=alt&startIndex=";
    var pageIndex = 0;

    var maxPlayers = 600;
    var playersPerPage = 15; // for ESPN, we need to scrape 15 players at a time

    var requestFinishedCB = _.after(maxPlayers / playersPerPage, function() {
        console.log("all requests done!");
        outputStream.end();
    });

    var outputStream = writeCSV(outputFile);
    if (outputStream) {
        // first call will include the categories, the rest will just be stats
        scrapeHTML(baseUrl + "0", outputStream, requestFinishedCB, true).then(function() {
            while ((pageIndex += playersPerPage) < maxPlayers) {
                scrapeHTML(baseUrl + pageIndex, outputStream, requestFinishedCB);
            }
        });
    }
};

var scrapeHTML = function(url, outputStream, finishedCB, includeCategories, playerSelector) {
    var requestDone = Q.defer();

    request(url, function(err, response, html) {
        if (err) {
            console.log("error scraping " + url + ": " + error);
            return;
        }

        var stringer = stringify();

        stringer.on('readable', function(){
            while (row = stringer.read()) {
                outputStream.write(row);
            }
        });

        var $ = cheerio.load(html);
        var players = [];

        if (includeCategories) {
            var categories = ['player_id','first_name','last_name','team','positions'];

            // scrape the categories
            $('div.games-fullcol table').first().find('tr.tableSubHead td.playertableStat').each(function() {
                categories.push($(this).text().toLowerCase());
            });

            stringer.write(categories);
        }

        $('div.games-fullcol table').not(function() {
            var playerData = $(this).find('.subheadPlayerNameLink').text();
            var positions = _str.strRightBack(_str.replaceAll(playerData, ", ", ","), " ");
            return !isPositionPlayer(positions);
        }).each(function() {
            var player = [];

            // first scrape player name, team, position
            var playerData = $(this).find('.subheadPlayerNameLink').text();

            // remove ranking info
            var playerInfo = _str.words(_str.replaceAll(_str.strRight(playerData, ". "), ",", ""));
            var firstName = playerInfo[0];
            var lastName = playerInfo[1];

            player.push(utils.getPlayerId(firstName, lastName));
            player.push(firstName);
            player.push(lastName);
            player.push(playerInfo[2].toUpperCase()); // team
            player.push(normalizePositions(_.rest(playerInfo, 3).join(","))); // positions

            // then scrape stats
            var stats = $(this).find('tr.tableBody').first().find('td.playertableStat').each(function() {
                player.push($(this).text());
            });

            players.push(player);
        });

        players.forEach(function(player) {
            stringer.write(player);
        });

       // stringer.unpipe();
        stringer.end();

        finishedCB();

        requestDone.resolve();
    });

    return requestDone.promise;
};

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

var KNOWN_SCRIPTS = ["normalize-file","download-data"];

var scriptName = process.argv[2];
if (scriptName) {
    switch (scriptName) {
        case KNOWN_SCRIPTS[0]: {
            return normalizeFile(process.argv[3]);
        }
        case KNOWN_SCRIPTS[1]: {
            return scrapeESPN(process.argv[3]);
        }
        default: {
            console.error("unknown script! options: " + KNOWN_SCRIPTS.toString());
        }
            
    }
} else {
    console.log("pick a script to run!");
}
