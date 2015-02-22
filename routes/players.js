var aws = require('aws-sdk'),
    express = require('express'),
    _ = require('underscore');

var credentials = new aws.SharedIniFileCredentials({profile: 'ffb'});
aws.config.credentials = credentials;
aws.config.update({ region: 'us-east-1' });

// in order of "value" to determine which position a player should be considered as
var POSITIONS = ["C", "SS", "3B", "2B", "OF", "1B", "DH"];

// number of players to use to create a composite replacement level
var REP_LEVEL_SAMPLE_SIZE = 5;
var RL_COMP_RANGE = Math.floor(REP_LEVEL_SAMPLE_SIZE / 2);

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
        if (position === 'DH') {
            return 5;
        } else if (position === 'OF') {
            return 36; 
        } else if (position === 'C') {
            return 24;
        }

        return 12;
    },
    usesCI: function() {
        return true;
    },
    usesMI: function() {
        return true;
    },
    rosterSize: 14
};

// creates a map with on key for each position, and the default value of each
// defined by the given constant parameter (possible values: 'array')
function createPositionMap(defaultVal) {
    var positionMap = {};

    POSITIONS.forEach(function(position) {
        positionMap[position] = (defaultVal === 'array' ? [] : false);
    });

    return positionMap;
}

function isCorner(position) {
    return position === '1B' || position === '3B';
}

function isMiddle(position) {
    return position === '2B' || position === 'SS';
}

function getWeakestPosition(positions) {
    var weakestPosition;
    var positionIndex = POSITIONS.length;

    positions.forEach(function(position) {
        var index = POSITIONS.indexOf(position);
        if (index < positionIndex) {
            weakestPosition = position;
            positionIndex = index;
        }
    });

    return weakestPosition;
}

var bySGP = function(p1, p2) {
    return p2.SGP - p1.SGP;
};

var sgpIndex = function(player) {
    return -player.sgp;
};

function PositionTracker(position, numDrafted, usesUtil) {
    // this object is a sorted array that maintains only the top <numDrafted>
    // players at each position; when attempting to add a new player, 
    // if a player is removed from the array because of falling out of this range
    // the player is returned to be moved to another position

    // if usesUtil is true, only track as many players as will be drafted, as the
    // the replacement level calculation will be based on a separate, utility pool,
    // otherwise, track extra players in order to calculate a composite replacement level
    this.numToTrack = numDrafted + (usesUtil ? 0 : RL_COMP_RANGE);
    this.position = position;

    this.topPlayers = [];
}

PositionTracker.prototype.canTrack = function(player) {
    var position = (player.positions.length > 1 ? getWeakestPosition(player.positions) : player.positions[0]);
    return position === this.position;
};

PositionTracker.prototype.addPlayer = function(player) {
    // attempt to add a player to the tracked list and, if applicable, return a player
    // that was removed (or the player itself if not added)
    var removedPlayer = [player];
    var numTracked = this.topPlayers.length;
    if (numTracked < this.numToTrack || _.last(this.topPlayers).sgp < player.sgp) {
        // the new player belongs in the top range, insert it in a sorted fashion
        var index = _.sortedIndex(this.topPlayers, player, sgpIndex);

        this.topPlayers.splice(index, 0, player);
        removedPlayer = this.topPlayers.splice(this.numToTrack, 1);
    }

    return removedPlayer.length > 0 ? removedPlayer[0] : false;
};

function PlayerPool(leagueSettings) {
    // this array is in order, and acts as a chain -- objects that are moved out
    // of a position with a higher priority (lower index) may be moved into
    // another position with a lower priority
    this.leagueSettings = leagueSettings;

    this.positionTrackerChain = [];
    POSITIONS.forEach(function(position) {
        var usesUtil = (position === 'DH') ||
            (isCorner(position) && leagueSettings.usesCI()) ||
            (isMiddle(position) && leagueSettings.usesMI());
        this.chain.push(
            new PositionTracker(position, leagueSettings.numDrafted(position), usesUtil));
    }, { chain: this.positionTrackerChain });
}

PlayerPool.prototype.addPlayer = function(player) {
    // attempt to add a player to each player tracker, in order
    // if a tracker adds a player successfully and displaces another player,
    // or if the tracker does not track the player given, keep moving down the chain
    // until a tracker doesn't return a player to place
    var playerToPlace = player;
    var tracker = 0;

    for (var i = 0; i < this.positionTrackerChain.length; i++) {
        var tracker = this.positionTrackerChain[i];
        if (tracker.canTrack(player)) {
            playerToPlace = tracker.addPlayer(player);
        }

        if (!playerToPlace) {
            // this means the player was added to the previous tracker
            // and no player was displaced
            return;
        }
    }
}

function PlayerTracker(leagueSettings) {
    this.leagueSettings = leagueSettings;

    // tracks all players aleady evaluated in sorted order
    this.positionMap = createPositionMap('array');

    // maintain list of all players to be returned later
    this.allPlayers = [];

    // adds a player to the given sorted list, maintaining the sort,
    // then adds the player to the list of all players in the same fashion
    this.trackPlayer = function(trackingList, player) {
        var index = _.sortedIndex(trackingList, player, function(player) {
            return -player.SGP;
        });

        trackingList.splice(index, 0, player);

        index = _.sortedIndex(this.allPlayers, player, function(player) {
            return -player.SGP;
        });

        this.allPlayers.splice(index, 0, player);
    };

    this.getUtilityList = function(position) {
        return (isCorner(position) ? this.corners : (isMiddle(position) ? this.middles : (position === 'DH' ? this.allPlayers : false)));
    }

    // number of players that need to be tracked in order to
    // properly calculate a composite replacement level
   // this.numToTrack = leagueSettings.numTeams + Math.floor(REP_LEVEL_COMP_SIZE / 2);

    //this.corners = leagueSettings.numCorners * leagueSettings.numTeams;
    //this.middles = leagueSettings.numMiddles * leagueSettings.numTeams;

    /*this.trackPlayer = function(position) {
        var t = this.numExtraToTrack;

        // check to track players in the following order:
        //  1. players that would be drafted to play at the specific position
        //  2. players that would be played at the position but would be drafted as a CI/MI
        //  3. players needed to calculate the composite replacement level
        if (this.tracker[position].length < this.numToTrack) {
            return true;
        } else {
            return this.tracker[position].length < this.numToTrack || 
                (isCorner(position) && (this.corners-- > 0 || this. ||
                (isMiddle(position) && this.middles-- > 0);
        }
    }*/
}

PlayerTracker.prototype.addPlayer = function(player) {
    // slot each player into their "weakest" position
    var position = (player.positions.length > 1 ? getWeakestPosition(player.positions) : player.positions[0]);
    this.trackPlayer(this.positionMap[position], player);

    // then add the player to any utility spots, if applicable
    /*var utilList = this.getUtilityList(position);
    if (utilList) {
        trackPlayer(utilList, player);
    }*/
};

PlayerTracker.prototype.getPlayers = function() {
    return this.allPlayers; 
}

function averageSGP(playerList) {
    return _.reduce(_.pluck(playerList, 'SGP'), function(memo, sgp) {
        return memo + sgp;
    }, 0) / playerList.length;
}

function getCorners(allPlayers, numPlayers) {
    return _.filter(allPlayers, function(player) {
        return player.positions.indexOf("1B") >= 0 || player.positions.indexOf("3B") >= 0;
    }).slice(0, numPlayers);
}

function getMiddles(allPlayers, numPlayers) {
    return _.filter(allPlayers, function(player) {
        return player.positions.indexOf("2B") >= 0 || player.positions.indexOf("SS") >= 0;
    }).slice(0, numPlayers);
}

function getUtil(allPlayers, numPlayers) {
    return allPlayers.slice(20, 20 + numPlayers);
}

function calculateReplacementValue(draftedPlayers, utilPlayers, numDrafted) {
    var playerList = draftedPlayers.concat(utilPlayers).sort(bySGP);
    return averageSGP(playerList.slice(numDrafted - RL_COMP_RANGE, numDrafted + RL_COMP_RANGE + 1));
}

PlayerTracker.prototype.calculateReplacementLevel = function() {
    // build list of utility players that will be drafted
    // FIXME there has to be a more efficient way to do this

    // remove players from the utility list that will be drafted at 
    // their "natural" position
    var utilityList = this.allPlayers.slice();
    for (var position in this.positionMap) {
        var positionList = this.positionMap[position];
        for (var i = 0; i < this.leagueSettings.numDrafted(position); i++) {
            utilityList.splice(utilityList.indexOf(positionList[i]), 1);
        }
    }

    for (var position in this.positionMap) {
        // positionList is sorted in order of SGP, so we just need to find the replacement
        // level and apply the offset to each player
        var numDrafted = this.leagueSettings.numDrafted(position);

        var positionList = this.positionMap[position];

        // first we need to move the utility players into this list, if applicable,
        // to accurately measure the baseline against the draftable pool of players
        var rlSGP = 0;

        if (isCorner(position)) {
            rlSGP = calculateReplacementValue(positionList.slice(0, numDrafted), getCorners(utilityList, numDrafted), numDrafted * 2);
        } else if (isMiddle(position)) {
             rlSGP = calculateReplacementValue(positionList.slice(0, numDrafted), getMiddles(utilityList, numDrafted), numDrafted * 2);
        } else if (position === 'DH') {
            rlSGP = calculateReplacementValue(positionList.slice(0, numDrafted), getUtil(utilityList, numDrafted), numDrafted);
        }
        else {
            // calculate replacement level SGP using a composite of players around
            // the last player that would be drafted
            rlSGP = averageSGP(positionList.slice(numDrafted - RL_COMP_RANGE, numDrafted + RL_COMP_RANGE + 1));
        }

        // finally, apply the replacement level adjustment to each player in the list
        positionList.forEach(function(player) {
            player.adjSGP = (player.SGP - rlSGP);
        });
    }
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
    this.positions = rawData.positions.SS; // array of positions
    this.projection = new Projection(rawData.projected_stats.M);
}

Player.prototype.toString = function() {
    return this.name;
}

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
}

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

    players.calculateReplacementLevel();

    return players;
}

var router = express.Router();

router.get('/', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var gainPointMetrics = new GainMetrics(testMetricData);

    var db = new aws.DynamoDB();

    db.scan(scanParams, function(err, data) {
        if (err) resp.send(err);
        else {
            // use data to create player objects
            var players = createPlayers(data.Items, gainPointMetrics);
            resp.render('index', { players: players.getPlayers() });
        }
    });
});

router.get('/get_total', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var db = new aws.DynamoDB();

    db.scan(scanParams, function(err, data) {
        if (err) resp.end(err);
        else resp.json({ "players": data.Count });
    });
});

module.exports = router;