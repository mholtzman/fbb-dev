var fs = require('fs'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    aws = require('aws-sdk'),
    _ = require('underscore'),
    _str = require('underscore.string'),
    upload = require('./upload');

var credentials = new aws.SharedIniFileCredentials({ profile: 'fbb' });
aws.config.credentials = credentials;
aws.config.update({ region: 'us-east-1' });

var db = new aws.DynamoDB();

function uploadPlayerData(playerData) {
    // data will be an array of player objects
    playerData.forEach(function(player) {

        var params = {
            TableName: 'players',
            Key: {
                player_id: {
                    S: upload.getPlayerId(player.Name)
                },
            },
            UpdateExpression: 'set projected_stats = :proj',
            ExpressionAttributeValues: {
                ":proj": {
                    M: {
                        pa: { N: player.PA },
                        ab: { N: player.AB },
                        h: { N: player.H },
                        '2b': { N: player['2B'] },
                        '3b': { N: player['3B'] },
                        hr: { N: player.HR },
                        r: { N: player.R },
                        rbi: { N: player.RBI },
                        bb: { N: player.BB },
                        so: { N: player.SO },
                        hbp: { N: player.HBP },
                        sb: { N: player.SB },
                        cs: { N: player.CS }
                    }
                }
            }
        };
        
        db.updateItem(params, function(err, resp) {
            if (err) {
                console.log("Error: " + err);
            }
        });
    });
}

var uploadData = function(fileStream, player_ids) {
    var playersToUpdate = [];
    var parser = parse({columns:true});

    var transformer = transform(function(data) {
        var player_id = upload.getPlayerId(data.Name);
        if (_.contains(player_ids, player_id)) {
            playersToUpdate.push(data);
        }
    });

    transformer.on('finish', function() {
        console.log("Projections to upload: " + player_ids.length);

        uploadPlayerData(playersToUpdate);
    })

    fileStream.pipe(parser).pipe(transformer);
};

var uploadFile = process.argv[2];
if (uploadFile) {
    // first, obtain all of the records in the DB as these are the only
    // ones we can update
    db.scan({ TableName: 'players' }, function(err, data) {
        var player_ids = [];
        data.Items.forEach(function(item) {
            player_ids.push(item.player_id.S);
        });

        // once we have player IDs, filter the projection input before
        // uploading it
        file = fs.createReadStream(uploadFile);
        file.on('error', function(err) {
            console.log("error opening stream: " + err);
        });

        uploadData(file, player_ids);
    });
} else {
    console.log("Enter a file to upload!");
}

