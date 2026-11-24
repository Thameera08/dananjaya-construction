/**
 * Create (or promote) an ADMIN account without seeding demo data — use this for production.
 *
 *   npm run create-admin -- --email owner@company.lk --name "Owner Name" [--password '...']
 *
 * If the email already exists the account is promoted to ADMIN, re-activated, and its
 * password reset. Without --password a strong random one is generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { arg, cliDb } from "./cli-db";
import { seedUsers } from "./seed-data";

async function main() {
  const email = arg("email");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- --email owner@company.lk --name "Owner" [--password <pw>]');
    process.exit(1);
  }
  const password = arg("password") || randomBytes(12).toString("base64url");
  if (password.length < 10) {
    console.error("✖ Password must be at least 10 characters.");
    process.exit(1);
  }
  const db = cliDb();
  const [r] = await seedUsers(
    db,
    [{ name: arg("name") || "Administrator", email, role: "ADMIN", password }],
    { resetPasswords: true },
  );
  console.log(`\n✔ ${r.created ? "Created" : "Updated"} ADMIN ${r.email}`);
  console.log(`  Password: ${password}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
