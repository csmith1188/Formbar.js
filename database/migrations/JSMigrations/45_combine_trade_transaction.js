const { dbGet, dbGetAll, dbRun } = require("@modules/database");

module.exports = {
    async run(database) {
        // Doesn't run if exchanges already exists
        const exchangeTable = await dbGet("SELECT name FROM sqlite_master WHERE name = 'exchanges' and type = 'table'");
        if (exchangeTable?.name) return;

        const transactionRows = await dbGetAll("SELECT * FROM transactions");
        
        let combinedExchanges = await Promise.all(transactionRows.map(async (transaction) => {
            let fromFounderId, toFounderId;
            const selectPoolFounder = "SELECT user_id FROM digipog_pool_users WHERE pool_id = ? AND owner = 1";
            
            if (transaction.from_type === "pool") {
                fromFounderId = (await dbGet(selectPoolFounder, [transaction.from_id])).user_id;
            }
            if (transaction.to_type === "pool") {
                toFounderId = (await dbGet(selectPoolFounder, [transaction.to_id])).user_id;
            }
            
            const datetime = new Date(Number(transaction.date));
            
            return {
                fromUserId: fromFounderId ?? transaction.from_id,
                fromId: transaction.from_type === "pool" ? transaction.from_id : null,
                fromType: transaction.from_type,
                offer: {0: transaction.amount},
                toUserId: toFounderId ?? transaction.to_id,
                toId: transaction.to_type === "pool" ? transaction.to_id : null,
                toType: transaction.to_type,
                request: {},
                reason: transaction.reason,
                status: "completed",
                failureReason: null,
                createdAt: datetime,
                updatedAt: datetime
            };
        }));

        const tradeRows = await dbGetAll("SELECT * FROM trades");
        combinedExchanges = combinedExchanges.concat(tradeRows.map((trade) => {
            const offer = {};

            // Set digipog amounts
            if (trade.offered_digipogs != null) {
                offer[0] = trade.offered_digipogs;
            }

            if (trade.offered_items != null) {
                // Set item ids and quantity to the new format
                const offeredItems = JSON.parse(trade.offered_items);

                for (const {itemId, quantity} of offeredItems) {
                    offer[itemId] = quantity;
                }
            }

            // Do the same for request
            const request = {};

            if (trade.requested_digipogs != null) {
                request[0] = trade.requested_digipogs;
            }

            if (trade.requested_items != null) {
                const requestedItems = JSON.parse(trade.requested_items);

                for (const {itemId, quantity} of requestedItems) {
                    request[itemId] = quantity;
                }
            }

            const createdAt = new Date(trade.created_at);
            const updatedAt = new Date(trade.updated_at);
            
            return {
                fromUserId: trade.from_user,
                fromId: trade.from_pool_id,
                fromType: trade.from_source_type === "inventory" ? "user" : trade.from_source_type,
                offer: offer,
                toUserId: trade.to_user,
                toId: trade.to_pool_id,
                toType: trade.to_source_type === "inventory" ? "user" : trade.to_source_type,
                request: request,
                reason: "Trade",
                status: trade.status,
                failureReason: trade.failure_reason,
                createdAt: createdAt,
                updatedAt: updatedAt
            };
        }));

        combinedExchanges.sort((exchangeA, exchangeB) => exchangeA.createdAt - exchangeB.createdAt);

        await dbRun("BEGIN");
        
        await dbRun(`CREATE TABLE IF NOT EXISTS "exchanges"
               ( 
                   "id"            INTEGER NOT NULL UNIQUE,
                   "from_user_id"  INTEGER,
                   "from_id"  INTEGER,
                   "from_type"     TEXT,
                   "offer"  TEXT,
                   "to_user_id"    INTEGER,
                   "to_id"    INTEGER,
                   "to_type"       TEXT,
                   "request"    TEXT,
                   "reason"        TEXT,
                   "status"        TEXT,
                   "failure_reason"    TEXT,
                   "created_at"    TEXT, -- iso-8601
                   "updated_at"    TEXT, -- iso-8601
                   PRIMARY KEY ("id" AUTOINCREMENT)
               )`
             );

        for (const exchange of combinedExchanges) {
            await dbRun("INSERT INTO exchanges (from_user_id, from_id, from_type, offer, to_user_id, to_id, to_type, request, reason, status, failure_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  [
                      exchange.fromUserId,
                      exchange.fromId,
                      exchange.fromType,
                      JSON.stringify(exchange.offer),
                      exchange.toUserId,
                      exchange.toId,
                      exchange.toType,
                      JSON.stringify(exchange.request),
                      exchange.reason,
                      exchange.status,
                      exchange.failureReason,
                      exchange.createdAt.toISOString(),
                      exchange.updatedAt.toISOString()
                  ]);
        }

        await dbRun("COMMIT");
    }
}
