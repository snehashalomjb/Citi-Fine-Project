const Database = require('better-sqlite3');

// Connect to database (this creates the file 'cityfine.db' if it's missing)
const db = new Database('cityfine.db', { verbose: console.log });

// Create the 'violations' table strictly
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        plate TEXT,
        image TEXT,
        fine INTEGER,
        status TEXT,
        date TEXT,
        location TEXT
    )
`;

// Run the query to build the table
db.exec(createTableQuery);

console.log("✅ Database initialized & 'violations' table ready.");

module.exports = db;