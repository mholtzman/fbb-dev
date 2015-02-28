var fs = require('fs');

exports.openCSV = function(uploadFile) {
    var file = fs.createReadStream(uploadFile);
    file.on('error', function(err) {
        console.log("error opening stream: " + err);
    });

    return file;    
};

exports.writeCSV = function(fileToWrite) {
    var file = fs.createWriteStream(fileToWrite);
    file.on('error', function(err) {
        console.log("error opening stream: " + err);
    });

    return file;    
};
