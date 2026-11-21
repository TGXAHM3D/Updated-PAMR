// Vercel Function entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the Express app. The original URL (e.g. /api/departures) is
// preserved, so Express routing works unchanged.
module.exports = require('../server.js');
