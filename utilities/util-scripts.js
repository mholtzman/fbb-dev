var fs = require('fs'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    stringify = require('csv-stringify'),
    request = require('request'),
    cheerio = require('cheerio'),
    _ = require ('underscore'),
    Q = require('q'),
    _str = require('underscore.string'),
    utils = require('./data-utils'),
    parsers = require('./parsers'),
    positions = require('./position-utils'),
    upload = require('./upload-utils'),
    nconf = require('nconf');

nconf.env();

// returns a stream
var getPlayerNames = function(uploadFile, callback, batters, pitchers) {
    if (uploadFile) {
        var file = openCSV(uploadFile);
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
        var file = openCSV(uploadFile);
        var parser = parse({ columns: normalizeColumns });
        var stringer = stringify({ header: true });

        var players = [];

        var transformer = transform(function(player) {
            player.player_id = utils.getPlayerId(player.first_name, player.last_name);
            player.positions = positions.normalize(player.positions);
                
            return player;
        });

        file.pipe(parser).pipe(transformer).pipe(stringer).pipe(writeCSV('..\\data\\' + _str.strLeftBack(uploadFile, ".") + '-normalized.csv'));
    } else {
        console.log("Enter a CSV file to read!");
    }
};

// strips players from the first file that don't appear in any of the others
var intersectFiles = function(fileToStrip, filesToCompare, dryRun) {
    var playerLists = [];
    var lastNameLists = [];

    var removeOutliers = function() {
        var allPlayers = _.union.apply(this, playerLists);
        var allLastNames = _.union.apply(this, lastNameLists);

        var fileStream = openCSV(fileToStrip);

        var parser = parse({ columns: true });
        var stringer = stringify({ header: true });

        // create an array of player IDs
        var transformer = transform(function(player) {
            if (_.contains(allPlayers, player.player_id)) {
                return player;
            } else if (dryRun) {
                console.log("would remove " + player.player_id + (_.contains(allLastNames, player.last_name) ? " *******************" : ""));
            }
        });

        var pipe = fileStream.pipe(parser).pipe(transformer); 
        if (!dryRun) {
            pipe.pipe(stringer).pipe(writeCSV('..\\data\\' + _str.strLeftBack(fileToStrip, ".") + '-stripped.csv'));
        }
    };

    var fileDone = _.after(filesToCompare.length, removeOutliers);

    filesToCompare.forEach(function(file, index) {
        playerLists.push([]);
        lastNameLists.push([]);
        var fileStream = openCSV(file);

        var parser = parse({ columns: true });

        // create an array of player IDs
        var transformer = transform(function(player) {
            playerLists[index].push(player.player_id);
            lastNameLists[index].push(player.last_name);
        });

        transformer.on('finish', function() {
            console.log("done reading " + file);
            fileDone();
        });

        fileStream.pipe(parser).pipe(transformer);
    });    
};

var scrapeESPN = function(outputFile, pitchers) {
    var baseUrl = "http://games.espn.go.com/flb/tools/projections?display=alt&startIndex=";v

    var outputStream = writeCSV(outputFile);
    if (outputStream) {
        var requests = [];
        var parser = new parsers.ESPNParser(pitchers ? positions.PitcherSelector : positions.BatterSelector);

        // first call will include the categories, the rest will just be stats
        while (pageIndex < maxPlayers) {
            requests.push(scrapeHTML(baseUrl + pageIndex, parser, pageIndex === 0));

            pageIndex += playersPerPage;
        }

        Q.all(requests).then(function(allData) {
            console.log("all requests done, writing file!");

            var stringer = stringify();

            stringer.pipe(outputStream);

            allData.forEach(function(requestData) {
                requestData.forEach(function(row) {
                    stringer.write(row);
                });
            });

            stringer.end();
        });
    }
};

var scrapeCBS = function(outputFile, pitchers) {
    // CBS groups projections by position only
    var baseUrl = "http://fantasynews.cbssports.com/fantasybaseball/stats/sortable/cbs/%s/season/standard/projections?&start_row=";
    var pageIndex;

    var maxPlayersPerPosition = (pitchers ? 250 : 150);
    var playersPerPage = 50; // for CBS, we need to scrape 50 players at a time

    var outputStream = writeCSV(outputFile);
    if (outputStream) {
        var requests = [];

        var positionSet = (pitchers ? positions.pitcherPositions() : positions.batterPositions());

        // first call will include the categories, the rest will just be stats
        positionSet.forEach(function(position, index) {
            pageIndex = 1;
             while (pageIndex < maxPlayersPerPosition) {
                var statSelector = (pitchers ? (position === "SP" ? new positions.IPSelector(80) : new positions.IPSelector(40)) : new positions.ABSelector(200));
                requests.push(scrapeHTML(_str.sprintf((baseUrl + pageIndex), position), new parsers.CBSParser(statSelector, position), (index + pageIndex) === 1));
            
                pageIndex += playersPerPage;
            }
        });

        Q.all(requests).then(function(allData) {
            console.log("all requests done, writing file!");

            var allPlayers = [];
            var stringer = stringify();

            // remove duplicates
            var transformer = transform(function(player) {
                if (!_.contains(allPlayers, player[0])) {
                    allPlayers.push(player[0]);
                    return player;
                }
            });

            transformer.pipe(stringer).pipe(outputStream);

            allData.forEach(function(requestData) {
                requestData.forEach(function(row) {
                    transformer.write(row);
                });
            });

            transformer.end();
        });
    }
};

var scrapeHTML = function(url, siteParser, includeCategories) {
    var requestDone = Q.defer();

    request({ url: url }, function(err, response, html) {
        if (err) {
            console.log("error scraping " + url + ": " + error);
            return;
        }

        var $ = cheerio.load(html);
        var scrapedData = siteParser.parse($, includeCategories);

        console.log("request to " + url + " scraped data for " + scrapedData.length + " players");

        requestDone.resolve(scrapedData);
    });

    return requestDone.promise;
};

var uploadFile = function(file, site) {
    var fileStream = openCSV(file);
    if (fileStream) {
        upload(fileStream, site);
    } else {
        console.error("couldn't open file: " + file);
    }
};

var openCSV = function(uploadFile) {
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

var KNOWN_SCRIPTS = ["normalize-file","download-data","intersect-files","upload-file"];

var scriptName = process.argv[2];
if (scriptName) {
    switch (scriptName) {
        case KNOWN_SCRIPTS[0]: {
            return normalizeFile(process.argv[3]);
        }
        case KNOWN_SCRIPTS[1]: {
            var siteIndex = process.argv.indexOf("--site");
            var scraper;
            if (siteIndex > 0) {
                if (process.argv[siteIndex + 1] === 'espn') {
                    scraper = scrapeESPN;
                } else if (process.argv[siteIndex + 1] === 'cbs') {
                    scraper = scrapeCBS;
                }
            }

            if (!scraper) {
                console.error('please specify a site to get data from! usage: --site [espn|cbs]');
                return;
            }

            return scraper(process.argv[3], process.argv.indexOf('--pitchers') > 0);
        }
        case KNOWN_SCRIPTS[2]: {
            var dryRun = false;
            var fileStartIndex = 3;
            if (process.argv.indexOf('--dryrun') > 0) {
                dryRun = true;
                fileStartIndex = 4;
            }
            return intersectFiles(process.argv[fileStartIndex], _.rest(process.argv, fileStartIndex + 1), dryRun);
        }
        case KNOWN_SCRIPTS[3]: {
            var siteIndex = process.argv.indexOf("--site");
            return uploadFile(process.argv[3], process.argv[siteIndex + 1]);
        }
        default: {
            console.error("unknown script! options: " + KNOWN_SCRIPTS.toString());
        }
            
    }
} else {
    console.log("pick a script to run!");
}
