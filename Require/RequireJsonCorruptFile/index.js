try {
    require('./test.json');
} catch (e) {
	TNSLog("There was a corrupt or invalid package.json.");
}
