const ncp = require("ncp").ncp;
const path = require("path");

const fromDir = path.resolve(__dirname + "/../src/views");
const toDir = path.resolve(__dirname + "/../dist/views");

ncp(fromDir, toDir, (err) => {
    if (err) {
        return console.error(err);
    }

    console.log("Finished copying views directory.");
});