var aws = require('aws-sdk'),
    express = require('express'),
    _ = require('underscore');

// in order of increasing "value" to determine which position a player should be considered as
var POSITIONS = ["DH", "CI", "MI", "1B", "OF", "3B", "2B", "SS", "C"];

var byPosition = function(p1, p2) {
    return POSITIONS.indexOf(p2) - POSITIONS.indexOf(p1);
}

// number of players to use to create a composite replacement level
var REP_LEVEL_SAMPLE_SIZE = 5; // this should be odd to create an average around the replacement level player

var testData = 
    [
        {
            player_id: { S: "chase_utley" },
            first_name: { S: "Chase" },
            last_name: { S: "Utley" },
            team: { S: "PHI" },
            positions: { SS: "2B,3B" },
            projected_stats: {
                M: {
                    "avg": { N: "0.282" },
                    "r": { N: "79" },
                    "rbi": { N: "81" },
                    "hr": { N: "19" },
                    "sb": { N: "6" }
                }
            }
        },
        {
            player_id: { S: "troy_tulowitzki" },
            first_name: { S: "Troy" },
            last_name: { S: "Tulowitzki" },
            team: { S: "COL" },
            positions: { SS: "SS,OF" },
            projected_stats: {
                M: {
                    "avg": { N: "0.299" },
                    "r": { N: "89" },
                    "rbi": { N: "110" },
                    "hr": { N: "28" },
                    "sb": { N: "12" }
                }
            }
        }
    ];

var testMetricData = {
    amtPerGainPt: {
        M: {
            avgGain: { N: "0.0024" },
            rGain: { N: "24" },
            rbiGain: { N: "24.6" },
            hrGain: { N: "10.4" },
            sbGain: { N: "9.4" }
        }
    },
    baselines: { 
        M: {
            avg: { N: ".267" },
            abs: { N: "509" }
        }
    }
};

var testLeagueSettings = {
    numDrafted: function(position) {
        switch (position) {
            case 'OF':
                return 60;
            case 'C':
                return 24;
        }

        return 12;
    },
    rosterSize: 14
};

function isCorner(position) {
    return position === '1B' || position === '3B';
}

function isMiddle(position) {
    return position === '2B' || position === 'SS';
}

var sortedSGPIndex = function(player) {
    return -player.SGP;
};

var sumValues = function(memo, sgp) {
    return memo + sgp;
};

function averageSGP(playerList) {
    return _.reduce(_.pluck(playerList, 'SGP'), sumValues, 0) / playerList.length;
}

// returns <numToFind> players in the <players> array that are eligible at the given <position>, 
// inclusive, searching in the given direction
function getPlayersAtPosition(numToFind, position, players, startIndex, step) {
    var foundPlayers = [];
    var i = startIndex;

    var player;
    while ((player = players[i]) && foundPlayers.length < numToFind) {
        if (player.isEligible(position)) {
            foundPlayers.push(player);
        }

        i += step;
    }

    return foundPlayers;
}

// returns an average SGP at the given position, starting at the given index and
// averaging in an equal number of players in both directions
function getSGPAverageFrom(numToFind, position, players, startIndex) {
    // this will be a composite of the replacement level players that can then be averaged
    var playerRange = Math.floor(numToFind / 2);

    // add 1 to the 'getNext()' call to include the actual replacement player as well
    var replacementLevelComposite = 
        getPlayersAtPosition(playerRange, position, players, startIndex - 1, -1).concat(
        getPlayersAtPosition(playerRange + 1, position, players, startIndex, 1));

        return averageSGP(replacementLevelComposite);
}

function PlayerPool(leagueSettings) {
    this.leagueSettings = leagueSettings;

    // list of all players in the player pool, sorted by SGP
    this.allPlayers = [];
}

PlayerPool.prototype.markAsDrafted = function(numDrafted, position) {
    var playerIndex = 0;

    while (numDrafted > 0 && playerIndex < this.allPlayers.length) {
        var player = this.allPlayers[playerIndex++];

        // check if the player is eligible at one of the given position, or if
        // none are given, consider all players
        if (!player.drafted && player.isEligible(position)) {
            // use the aSGP field as a marker -- it will be overridden later
            player.drafted = true;
            numDrafted--;
        }
    }

    return playerIndex;
} 

PlayerPool.prototype.addPlayer = function(player) {
    this.allPlayers.splice(_.sortedIndex(this.allPlayers, player, sortedSGPIndex), 0, player);
};

PlayerPool.prototype.getAllPlayers = function() {
    return this.allPlayers;
};

PlayerPool.prototype.getReplacementLevels = function() {
    var replacementLevels = {};

    // store the index of the replacement level player for each position so we don't have to
    // traverse the array again to find it
    var startIndices = {};

    // first, mark the players that would be drafted at each position, note that the order here is important
    // as the utility slots will now be filled in last
    for (var i = POSITIONS.length; --i >= 0;) {
        var position = POSITIONS[i];
        startIndices[position] = this.markAsDrafted(this.leagueSettings.numDrafted(position), position);
    }

    // then, find the composite players to calculate replacement level
    POSITIONS.forEach(function(position) {
        replacementLevels[position] = 
            getSGPAverageFrom(REP_LEVEL_SAMPLE_SIZE, position, this.allPlayers, startIndices[position]);
        console.log("Replacement level for " + position + ": " + replacementLevels[position]);
    }, this);

    return replacementLevels;
};

function Projection(rawData) {
    this.h = Number(rawData.h.N);
    this.ab = Number(rawData.ab.N);
    this.r = Number(rawData.r.N);
    this.rbi = Number(rawData.rbi.N);
    this.hr = Number(rawData.hr.N);
    this.sb = Number(rawData.sb.N);
}

function Player(rawData, metrics) {
    this.name = rawData.first_name.S + " " + rawData.last_name.S;
    this.team = rawData.team.S;

    // sort the array of positions so that the most "valuable" position is first
    var positionArr = rawData.positions.SS;
    if (positionArr.length > 1) {
        positionArr.sort(byPosition);
    }

    this.positions = positionArr;
    this.projection = new Projection(rawData.projected_stats.M);
}

Player.prototype.isEligible = function(position) {
    // all players are eligible at Util
    return (this.positions[0] === position || 
        position === "DH" ||
        (position === "CI" && isCorner(this.positions[0])) ||
        (position === "MI" && isCorner(this.positions[0])));
};

Player.prototype.calculateSGP = function(leagueSettings, metrics) {
    var avgHits = (metrics.baselines.avg * metrics.baselines.abs);
    var totalAbs = ((leagueSettings.rosterSize - 1) * metrics.baselines.abs) +
        this.projection.ab;
    var totalHits = ((leagueSettings.rosterSize - 1) * avgHits) + this.projection.h;

    var avgGainPts = (totalHits / totalAbs) - metrics.baselines.avg;

    // calculate the sum across all categories
    var amtPerGainPt = metrics.amtPerGainPoint;
    this.SGP = (avgGainPts / amtPerGainPt.avg) +
        (this.projection.r / amtPerGainPt.r) +
        (this.projection.rbi / amtPerGainPt.rbi) +
        (this.projection.hr / amtPerGainPt.hr) +
        (this.projection.sb / amtPerGainPt.sb);
};

function GainMetrics(rawData) {
    this.amtPerGainPoint = {
        avg: Number(rawData.amtPerGainPt.M.avgGain.N),
        r: Number(rawData.amtPerGainPt.M.rGain.N),
        rbi: Number(rawData.amtPerGainPt.M.rbiGain.N),
        hr: Number(rawData.amtPerGainPt.M.hrGain.N),
        sb: Number(rawData.amtPerGainPt.M.sbGain.N)
    };

    this.baselines = {
        avg: Number(rawData.baselines.M.avg.N),
        abs: Number(rawData.baselines.M.abs.N)
    }
}


function createPlayers(rawData, metrics) {
    var players = new PlayerPool(testLeagueSettings);

    rawData.forEach(function(playerData) {
        var player = new Player(playerData);

        player.calculateSGP(testLeagueSettings, metrics);

        players.addPlayer(player);
    });

    return players;
}

var router = express.Router();

router.get('/', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var gainPointMetrics = new GainMetrics(testMetricData);

    var db = new aws.DynamoDB({ region: 'us-east-1' });

    db.scan(scanParams, function(err, data) {
        if (err) resp.send(err);
        else {
            // use data to create player objects
            var players = createPlayers(data.Items, gainPointMetrics);

            resp.render('index', { players: players.getAllPlayers(), repLevels: players.getReplacementLevels() });
        }
    });
});

router.get('/get_total', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var db = new aws.DynamoDB({ region: 'us-east-1' });

    db.scan(scanParams, function(err, data) {
        if (err) resp.end(err);
        else resp.json({ "players": data.Count });
    });
});

module.exports = router;