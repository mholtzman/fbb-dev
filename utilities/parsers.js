var _ = require ('underscore'),
    _str = require('underscore.string'),
    utils = require('./data-utils'),
    positions = require('./position-utils');

exports.ESPNParser = function ESPNParser(positionSelector) {
    this.positionSelector = positionSelector;

    this.parse = function($, includeCategories) {
        var parsedData = [];
        var positionSelector = this.positionSelector;

        var matchedPlayers = $('div.games-fullcol table').not(function() {
            var playerData = $(this).find('.subheadPlayerNameLink').text();
            var positions = _str.strRightBack(_str.replaceAll(playerData, ", ", ","), " ");
            return !positionSelector.matches(positions);
        });

        if (includeCategories) {
            var categories = ['player_id','first_name','last_name','team','positions'];

            // scrape the categories
            matchedPlayers.first().find('tr.tableSubHead td.playertableStat').each(function() {
                categories.push($(this).text().toLowerCase());
            });

            parsedData.push(categories);
        }

        matchedPlayers.each(function() {
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
            player.push(positions.normalize(_.rest(playerInfo, 3).join(","))); // positions

            // then scrape stats
            var stats = $(this).find('tr.tableBody').last().find('td.playertableStat').each(function() {
                player.push($(this).text());
            });

            parsedData.push(player);
        });

        return parsedData;
    }
}

exports.CBSParser = function CBSParser(statMinimumSelector, position) {
    this.statMinimumSelector = statMinimumSelector;
    this.position = position;

    this.parse = function($, includeCategories) {
        var statMinSelector = this.statMinimumSelector;
        var position = this.position;
        var parsedData = [];

        var dataTable = $('table.data');
        if (includeCategories) {
            var categories = ['player_id','first_name','last_name','team','positions'];
            var addPoint = categories.length;

            // scrape the categories, the first and last are just CBS labels
            dataTable.children('tr.label').first().children().slice(1, -1).each(function() {
                categories.push($(this).text().toLowerCase());
            });

            parsedData.push(categories);
        }

        // exclude the headers and footer
        dataTable.children().not('.title').not('.label').not('.footer').filter(function() {
            // filter out players with under 200 ABs
            return statMinSelector.matches(Number($(this).children().eq(1).text()));
        }).each(function() {
            var player = [];

            $(this).children().slice(0, -1).each(function(index) {
                // first field is the player's name, the rest are stats
                if (index === 0) {
                    var playerInfo = $(this).text().split(",");
                    var name = playerInfo[0].split(" ");
                    var firstName = name[0];
                    var lastName = _.rest(name, 1).join(" ");
                    var team = _str.clean(_.last(playerInfo));

                    player.push(utils.getPlayerId(firstName, lastName));
                    player.push(firstName);
                    player.push(lastName);
                    player.push(team);
                    player.push(position);
                } else {
                    player.push($(this).text());
                }
            });

            parsedData.push(player);
        });

        return parsedData;
    }
}