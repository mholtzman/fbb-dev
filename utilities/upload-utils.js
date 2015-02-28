var file = require('./file-utils'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    aws = require('aws-sdk'),
    _ = require ('underscore'),
    _str = require('underscore.string');

function createParser(filename) {
    var parser = parse({ columns: true });

    parser.on('end', function() {
        console.log('successfully parsed ' + filename);
    });

    parser.on('error', function(err) {
        console.log('error parsing ' + filename + " -- " + err);
    });
            
    return parser;
}

function createDynamoTransfomer(site, callback) {
    var requests = { 
        initRequests: [], // see 'createEmptyTableParams()'
        dataRequests: []
    };

    var transformer = transform(function(data) {
        requests.initRequests.push(createEmptyTableParams(data));
        requests.dataRequests.push(createUpdateProjectionParams(data, site));
    });

    transformer.on('finish', function() {
        console.log('created ' + requests.dataRequests.length + ' Dynamo requests');
        callback(null, requests);
    });

    transformer.on('error', function(err) {
        console.log('error transforming:' + err);
        callback(err);
    });
            
    return transformer;
}

var HBP_SAC_CONSTANT = 1.01;
var NO_WRITE = "ConditionalCheckFailedException";

var createEmptyTableParams = function(playerData) {
    // the 'projections' attribute needs to be set to an empty map before
    // subsequent updates can populate it

    return {
        TableName: 'players',
        Key: {
            player_id: { S: playerData.player_id }
        },
        ExpressionAttributeValues: {
            ":empty_map": { 
                M: { }
            }
        },
        ExpressionAttributeNames: {
            "#proj": "projections"
        },
        UpdateExpression: 'SET #proj = :empty_map',
        ConditionExpression: 'attribute_not_exists (#proj)' // only create a new, empty projections map if one doesn't exist
    };
}

var createUpdateProjectionParams = function(playerData, site) {
    var pa = playerData.pa;
    if (!pa) {
        // back out PA from AB + BB + random constant when HBP and SACs are missing
        pa = ((Number(playerData.ab) + Number(playerData.bb)) * HBP_SAC_CONSTANT).toString();
    }

    var h = playerData.h;
    if (!h) {
        // back out H from AB * AVG
        h = Math.floor(Number(playerData.ab) * Number(playerData.avg)).toString();
    }

    var projectionMap = { 
        M: {
            pa: { N: pa },
            ab: { N: playerData.ab },
            h: { N: h },
            hr: { N: playerData.hr },
            r: { N: playerData.r },
            rbi: { N: playerData.rbi },
            bb: { N: playerData.bb },
            k: { N: playerData.k },
            sb: { N: playerData.sb }
        } 
    };

    var doubles = playerData['2b'];
    if (doubles) {
        projectionMap.M["2b"] = { N: doubles };
    }

    var triples = playerData['3b'];
    if (triples) {
        projectionMap.M["3b"] = { N: triples };
    }

    var hbp = playerData.hbp;
    if (hbp) {
        projectionMap.M["hbp"] = { N: hbp };
    }

    var cs = playerData.cs;
    if (cs) {
        projectionMap.M["cs"] = { N: cs };
    }

    return {
        TableName: 'players',
        Key: {
            player_id: { S: playerData.player_id }
        },
        ExpressionAttributeValues: {
            ":projection": projectionMap
        },
        ExpressionAttributeNames: {
            "#proj": "projections"
        },
        UpdateExpression: 'SET #proj.' + site + ' = :projection'
    };
};

function writeDataToDB(requests, callback) {
    // data will be an array of player objects
    var db = new aws.DynamoDB({ region: 'us-east-1' });

    // check throughput of the table so we don't exceed it when batching
    db.describeTable({ TableName: 'players' }, function(err, data) {
        if (err) {
            console.log("error: " + err);
            return;
        }

        // each 'request' is made of up 2 separate DB writes
        var writeThroughput = data.Table.ProvisionedThroughput.WriteCapacityUnits;
        if (writeThroughput > 0) {
            var errors = [];
            var numWritten = 0,
                batchSize = 0,
                startIndex = 0,
                numRequests = requests.length;

            // create callback function
            var processed = _.after(numRequests, function() {
                callback((errors.length > 0 ? { errors: errors } : null), { count: numWritten });
            });

            while (startIndex < numRequests) {
                // batch the requests so as not to exceed the write throughput, write one batch every second or so
                var batchSize = Math.min(writeThroughput, numRequests - startIndex);

                var writeItems = _.bind(function() {
                    this.requests.slice(this.startIndex, this.startIndex + this.batchSize).forEach(function(request, index) {
                        console.log("sending request for: " + request.Key.player_id.S);
                            
                        db.updateItem(request, function(err, data) {
                            var playerId = request.Key.player_id.S;

                            if (err && (err.code !== NO_WRITE)) {
                                // this code means a conditional check failed, 
                                // which just means it wasn't necessary to write the data
                                console.log('error putting item: ' + err);
                                errors.push({ cause: err, playerId: playerId })
                            } else {
                                if (!err) {
                                    console.log("     =======> adding data: " + playerId);
                                } else {
                                    console.log('data already exists for: ' + playerId);
                                }
                                
                                numWritten++;
                            }

                            processed();
                        });
                    });
                }, { startIndex: startIndex, batchSize: batchSize, requests: requests });

                _.delay(writeItems, (Math.floor(startIndex / batchSize)) * 1100);

                startIndex += batchSize;
            }
        } else {
            console.log("couldn't determine write throughput!");
            return;
        }
    });
}

// this will create/update items in the players table
var uploadPlayerData = function(stream, site) {
    stream.pipe(parse({columns: true}, function(err, data) {
        if (err) {
            console.log('error: ' + err);
        }
        else {
            console.log('successfully parsed uploaded data!');


            console.log("uploading " + site + " data");
            writePlayerDataToDB(data, site);
        }
    }));
};

function handleDBErrors(errors) {
    errors.forEach(function(error) {
        console.error("failed to write data for " + error.playerId + ": " + error.cause);
    });
}

// this will update the projections attribute of items in the players table
var uploadProjectionData = function(fileName, site) {
    var stream = file.openCSV(fileName);
    var parser = createParser(fileName);
    var transformer = createDynamoTransfomer(site, function (err, data) {
        if (data) {
            // this will return two arrays, one of "init" requests needed to set up the DB, and
            // one of "data" requests to upload data
            var initRequests = data.initRequests;
            var dataRequests = data.dataRequests;

            writeDataToDB(initRequests, function(err, initData) {
                if (!err) {
                    console.log("initialized projection map for " + initData.count + " players, now uploading data")
                    writeDataToDB(dataRequests, function(err, requestData) {
                        if (!err) {
                            console.log(" ==== all player data written!");
                        } else {
                            console.log(" === wrote " + requestData.count + " items, with errors");
                            handleDBErrors(err.errors);
                        }
                    });
                } else {
                    handleDBErrors(err.errors);
                }
            });
        }
    });

    stream.pipe(parser).pipe(transformer);
};

exports.playerData = uploadPlayerData;
exports.projectionData = uploadProjectionData;


