var fs = require('fs'),
    parse = require('csv-parse'),
    aws = require('aws-sdk'),
    _ = require ('underscore'),
    _str = require('underscore.string');

var params = {
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

            /*if (positions.length > 1) {
                positions.splice(positions.indexOf("DH"), 1);
            }*/

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

            /*db.updateItem(params, function(err, data) {
                if (err) {
                    console.error("error: " + err);
                }
            });*/
        });
    }
});