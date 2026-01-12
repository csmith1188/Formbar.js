// 11_convert_transaction_timestamps.js
// This migration converts any ISO 8601 formatted timestamps in the 'date' column of the 'transactions' table to unix timestamps.

const { dbGetAll, dbRun } = require('../../../modules/database');
module.exports = {
    async run(database) {
        const transactions = await dbGetAll('SELECT id, date FROM transactions', [], database);
        for (const tx of transactions) {
            //check if timestamp is in ISO 8610 format
            if (typeof tx.date === 'string' && tx.date.includes('T')) {
                const date = new Date(tx.date);
                const unixTimestamp = Math.floor(date.getTime());
                await dbRun('UPDATE transactions SET date = ? WHERE id = ?', [unixTimestamp, tx.id]);
                console.log(`Converted ISO 8601 timestamp ${tx.date} to unix timestamp ${unixTimestamp}`);
            }
        }
    }
}