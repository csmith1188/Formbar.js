// Used to normalize the arguments passed to socket events
// This is because Python socket.io does not support passing multiple arguments
function normalizeArguments(...args) {
    if (args.length === 1 && Array.isArray(args[0])) {
        return args[0];
    }
    return args;
}

module.exports = {
    normalizeArguments
}