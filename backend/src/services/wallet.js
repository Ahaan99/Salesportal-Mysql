// Wallet sync (replaces the Postgres sync_wallet_on_commission trigger).
// Recomputes officer_wallets from the commissions table for one officer.
// Called automatically by the query builder after any commissions mutation
// and by the place_field_order RPC.
const { pool } = require("../config/db");

async function syncWallet(officerId, conn) {
  if (!officerId) return;
  const db = conn || pool;
  await db.query("INSERT IGNORE INTO officer_wallets (officer_id) VALUES (?)", [officerId]);
  await db.query(
    `UPDATE officer_wallets SET
       pending_amount   = COALESCE((SELECT SUM(amount) FROM commissions WHERE officer_id = ? AND status = 'pending'), 0),
       available_amount = COALESCE((SELECT SUM(amount) FROM commissions WHERE officer_id = ? AND status = 'available'), 0),
       withdrawn_amount = COALESCE((SELECT SUM(amount) FROM commissions WHERE officer_id = ? AND status = 'settled'), 0),
       total_earned     = COALESCE((SELECT SUM(amount) FROM commissions WHERE officer_id = ?), 0)
     WHERE officer_id = ?`,
    [officerId, officerId, officerId, officerId, officerId]
  );
}

module.exports = { syncWallet };
