/**
 * Seed: user accounts (Admin + demo Estimator/Accountant) and the Gameon World project.
 *
 *   npm run db:seed                       # idempotent
 *   npm run db:seed -- --reset            # drop & recreate the GW project
 *   npm run db:seed -- --reset-passwords  # re-apply seed passwords to existing accounts
 *   npm run db:seed -- --no-demo-users    # only the admin account
 *
 * Passwords come from SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD; if unset, strong random
 * passwords are generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { cliDb, flag } from "./cli-db";
import { seedGameonProject, seedUsers, type SeedUser } from "./seed-data";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const gen = () => randomBytes(12).toString("base64url");

async function main() {
  const db = cliDb();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || gen();
  const demoPassword = process.env.SEED_DEMO_PASSWORD || gen();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@dananjaya.lk").toLowerCase();

  const list: SeedUser[] = [
    { name: process.env.SEED_ADMIN_NAME || "System Administrator", email: adminEmail, role: "ADMIN", password: adminPassword },
  ];
  if (!flag("no-demo-users")) {
    list.push(
      { name: "Quantity Surveyor", email: "estimator@dananjaya.lk", role: "ESTIMATOR", password: demoPassword },
      { name: "Site Cashier", email: "accountant@dananjaya.lk", role: "ACCOUNTANT", password: demoPassword },
    );
  }

  const resetPasswords = flag("reset-passwords");
  const result = await seedUsers(db, list, { resetPasswords });
  console.log("\n👤 User accounts");
  for (const u of result) {
    const pw = list.find((l) => l.email === u.email)!.password;
    const shown = u.created || resetPasswords ? pw : "(unchanged — existing account)";
    console.log(`   ${u.role.padEnd(10)} ${u.email.padEnd(28)} ${shown}`);
  }

  const [admin] = await db.select().from(users).where(eq(users.email, adminEmail));
  const p = await seedGameonProject(db, { reset: flag("reset"), createdBy: admin?.id });
  console.log("\n🏗  Gameon World Office Renovation (GW)");
  if (p.created) {
    console.log(`   Gross quoted value : Rs. ${p.gross}`);
    console.log(`   Net contract value : Rs. ${p.net}`);
    console.log(`   Advance (75%)      : Rs. ${p.advance}`);
    console.log("   RC-001, EX-001…EX-006 inserted");
  } else {
    console.log("   Already exists — skipped (use --reset to recreate)");
  }
  console.log("\n✔ Seed complete. Change seeded passwords after first sign-in (Account page).\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
