try
{
    var io = require("./io");
}
catch(e)
{
	if (e instanceof ModuleError) {
		TNSLog('ModuleError');
	}
}
