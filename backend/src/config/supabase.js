// MySQL-backed drop-in replacement for the old Supabase admin client.
// Controllers keep importing { supabaseAdmin } and calling
// .from(table)... / .rpc(name, args) exactly as before.
// Auth methods (signInWithPassword, admin.*) now live in src/services/authService.js
// and are exposed here only for backwards compatibility during the migration.
const { QueryBuilder } = require("./queryBuilder");
const { rpc } = require("./rpc");

const supabaseAdmin = {
  from(table) {
    return new QueryBuilder(table);
  },
  rpc(name, args) {
    return rpc(name, args);
  },
  // Old Supabase auth API — intentionally disabled. All auth flows must use
  // src/services/authService.js (JWT + bcrypt against the MySQL users table).
  auth: {
    async getUser() {
      throw new Error("supabaseAdmin.auth.getUser removed — use verifyToken() from services/authService");
    },
    async signInWithPassword() {
      throw new Error("supabaseAdmin.auth.signInWithPassword removed — use login() from services/authService");
    },
    admin: {
      async createUser() {
        throw new Error("supabaseAdmin.auth.admin.createUser removed — use createUser() from services/authService");
      },
      async updateUserById() {
        throw new Error("supabaseAdmin.auth.admin.updateUserById removed — use authService helpers");
      },
      async deleteUser() {
        throw new Error("supabaseAdmin.auth.admin.deleteUser removed — use authService helpers");
      },
      async listUsers() {
        throw new Error("supabaseAdmin.auth.admin.listUsers removed — query the users table directly");
      },
    },
  },
};

module.exports = { supabaseAdmin };
