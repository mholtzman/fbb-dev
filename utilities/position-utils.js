var _ = require ('underscore'),
    _str = require('underscore.string');

var byPosition = function(p1, p2) {
    return ALL_POSITIONS.indexOf(p2) - ALL_POSITIONS.indexOf(p1);
}

exports.normalize = function(positions) {
    // change slashes to commas
    var normalizedPosition = _str.replaceAll(positions, '/', ',');

    // turn into array for processing
    normalizedPosition = normalizedPosition.split(",");

    // change RF,LF,CF positions to OF
    if (_.some(normalizedPosition, function(position) {
        return _.contains(OF_POSITIONS, position);
    })) {
        normalizedPosition = _.without.apply(this, [normalizedPosition].concat(OF_POSITIONS));
        normalizedPosition.push("OF");
    }

    // remove DH unless it's the only positions
    if (normalizedPosition.length > 1) {
        normalizedPosition = _.without(normalizedPosition, "DH");
    }

    // then sort and turn back into a string
    return normalizedPosition.sort(byPosition).join(",");
}

// in order of increasing "value" to determine which position a player should be considered as
var ALL_POSITIONS = ["DH", "1B", "OF", "3B", "2B", "SS", "C", "RP", "SP"];
var OF_POSITIONS = ["RF", "LF", "CF"];

var batterPositions = function() {
    return ALL_POSITIONS.slice(0 ,-2);
};

exports.batterPositions = batterPositions;

var pitcherPositions = function() {
    return ALL_POSITIONS.slice(-2);
};

exports.pitcherPositions = pitcherPositions;

function PositionSelector() {
    this.positions = ALL_POSITIONS;
}

PositionSelector.prototype.matches = function(posToMatch) {
    return _.intersection(this.positions, posToMatch.split(",")).length > 0;
};

function BatterSelector() {
    this.positions = batterPositions();
}

BatterSelector.prototype = Object.create(PositionSelector.prototype);

function PitcherSelector() {
    this.positions = pitcherPositions();
}

PitcherSelector.prototype = Object.create(PositionSelector.prototype);

function StatSelector() {
    this.minimum = 0;
}

StatSelector.prototype.matches = function(statValue) {
    return statValue > this.minimum;
};

var ABSelector = function(minimum) {
    this.minimum = minimum;
};

ABSelector.prototype = Object.create(StatSelector.prototype);

var IPSelector = function(minimum) {
    this.minimum = minimum;
};

IPSelector.prototype = Object.create(StatSelector.prototype);

exports.PositionSelector = new PositionSelector();
exports.BatterSelector = new BatterSelector();
exports.PitcherSelector = new PitcherSelector();
exports.ABSelector = ABSelector;
exports.IPSelector = IPSelector;