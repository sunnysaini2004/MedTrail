require("dotenv").config();

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const bcrypt = require("bcryptjs");
const pool = require("../src/config/db");
const { writeAudit } = require("../src/modules/audit/audit.service");

function promptHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive terminal so the password stays hidden."));
  }

  return new Promise((resolve, reject) => {
    stdout.write(label);
    const wasRaw = Boolean(stdin.isRaw);
    let value = "";

    function finish(error) {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function bootstrapAdmin() {
  const prompts = readline.createInterface({ input: stdin, output: stdout });
  const fullName = (await prompts.question("Admin full name: ")).trim();
  const email = (await prompts.question("Admin email: ")).trim().toLowerCase();
  prompts.close();
  const password = await promptHidden("Admin password (input hidden): ");

  if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Use a 2–120 character name, valid email, and password of 8–72 bytes.");
  }

  const [admins] = await pool.execute("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
  if (admins.length > 0) {
    throw new Error("An administrator already exists. Use an authorized admin account to manage doctors.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')",
      [fullName, email, passwordHash]
    );
    await writeAudit(connection, {
      userId: result.insertId,
      action: "ADMIN_BOOTSTRAPPED",
      entityType: "USER",
      entityId: result.insertId,
      details: { provisioning: "local_interactive_setup" },
    });
    await connection.commit();
    console.log("Administrator account created. Keep the login details private.");
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("That email address is already registered.");
    }
    throw new Error("Administrator account could not be created.");
  } finally {
    connection.release();
  }
}

bootstrapAdmin()
  .catch((error) => {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
