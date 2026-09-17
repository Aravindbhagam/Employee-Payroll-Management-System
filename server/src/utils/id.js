const crypto = require('crypto');

/** Generates a new primary key value. IDs are assigned application-side (not by the database). */
function newId() {
  return crypto.randomUUID();
}

module.exports = { newId };
