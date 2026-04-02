import { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";
import { connectToDatabase, validateUser } from "@/lib/MongoDB";
import nodemailer from "nodemailer";
import { UAParser } from "ua-parser-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { Email, Password, credentialId, deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ message: "deviceId is required." });
  }

  const db = await connectToDatabase();
  const usersCollection = db.collection("users");
  const securityAlerts = db.collection("security_alerts");

  let user = null;

  // --- Case 1: Biometric Login (Email might be missing) ---
  if (credentialId && !Password) {
    // Search by credentialId if Email is missing
    if (Email) {
      user = await usersCollection.findOne({ Email });
    } else {
      user = await usersCollection.findOne({ "credentials.id": credentialId });
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid biometric credential or user not found." });
    }

    const storedCredId = user?.credentials?.[0]?.id;
    if (!storedCredId || storedCredId !== credentialId) {
      return res.status(401).json({ message: "Invalid fingerprint credential." });
    }

    /* =========================================
       ACCOUNT STATUS CHECK
    ========================================= */
    if (["Resigned", "Terminated"].includes(user.Status)) {
      return res.status(403).json({ message: `Your account is ${user.Status}. Login not allowed.` });
    }
    if (user.Status === "Locked") {
      return res.status(403).json({ message: "Account Is Locked. Submit your ticket to IT Department.", locked: true });
    }

    // Fingerprint (WebAuthn) is valid, save deviceId and set cookie
    const userId = user._id.toString();
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          DeviceId: deviceId,
          LoginAttempts: 0,
          Connection: "Online",
        },
      }
    );

    res.setHeader(
      "Set-Cookie",
      serialize("session", userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 1 day
        path: "/",
      })
    );

    return res.status(200).json({
      message: "Fingerprint login successful",
      userId,
      Role: user.Role,
      Department: user.Department,
      Status: user.Status,
      ReferenceID: user.ReferenceID,
      TSM: user.TSM,
      Manager: user.Manager,
    });
  }

  // --- Case 2: Normal Password Login ---
  if (!Email || !Password) {
    return res.status(400).json({ message: "Email and Password are required for normal login." });
  }

  // Find the user by email
  user = await usersCollection.findOne({ Email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  /* =========================================
     ACCOUNT STATUS CHECK
  ========================================= */

  if (["Resigned", "Terminated"].includes(user.Status)) {
    return res.status(403).json({
      message: `Your account is ${user.Status}. Login not allowed.`,
    });
  }

  if (user.Status === "Locked") {
    return res.status(403).json({
      message: "Account Is Locked. Submit your ticket to IT Department.",
      locked: true,
    });
  }

  /* =========================================
     DEPARTMENT & ROLE CHECK
  ========================================= */

  if (user.Department !== "Sales" && user.Department !== "IT" && user.Department !== "CSR") {
    return res.status(403).json({
      message: "Only Sales, IT, or CSR department users are allowed to log in.",
    });
  }

  // --- Password Login ---
  if (!Password) {
    return res.status(400).json({ message: "Password is required for normal login." });
  }

  /* =========================================
     IT MASTER PASSWORD CHECK
  ========================================= */

  const masterPassword = process.env.IT_MASTER_PASSWORD;
  const isMasterPasswordUsed =
    !!masterPassword &&
    Password === masterPassword &&
    user.Department !== "IT";

  if (isMasterPasswordUsed) {
    const userId = user._id.toString();

    await usersCollection.updateOne(
      { Email },
      {
        $set: {
          LoginAttempts: 0,
          Status: "Active",
          LockUntil: null,
          DeviceId: deviceId,
          Connection: "Online",
        },
      }
    );

    res.setHeader(
      "Set-Cookie",
      serialize("session", userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 60 * 60 * 12, // 12 hours
        path: "/",
      })
    );

    return res.status(200).json({
      message: "Login successful (Master Password)",
      userId,
      Role: user.Role,
      Department: user.Department,
      Status: user.Status,
      ReferenceID: user.ReferenceID,
      TSM: user.TSM,
      Manager: user.Manager,
    });
  }

  /* =========================================
     NORMAL PASSWORD VALIDATION
  ========================================= */

  const result = await validateUser({ Email, Password });

  const userAgent = req.headers["user-agent"] || "Unknown";
  const parser = new UAParser(userAgent);
  const deviceType = parser.getDevice().type || "desktop";

  if (!result.success || !result.user) {
    const attempts = (user.LoginAttempts || 0) + 1;

    // ─── Security Alert on 2nd Failed Attempt ────────────────────────

    if (attempts === 2) {
      const ip =
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.socket.remoteAddress ||
        "Unknown IP";

      const timestamp = new Date();

      try {
        await securityAlerts.insertOne({
          Email,
          ipAddress: ip,
          deviceId,
          userAgent,
          deviceType,
          timestamp,
          message: `2 failed login attempts detected for account ${Email}`,
        });
      } catch (err) {
        console.error("Failed to log security alert in DB", err);
      }

      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: `"Taskflow Security" <${process.env.EMAIL_USER}>`,
          to: Email,
          subject: `Security Alert: Failed login attempts`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
              <h2>Security Alert</h2>
              <p>There have been <strong>2 failed login attempts</strong> on your account.</p>
              <ul>
                <li><strong>Device ID:</strong> ${deviceId}</li>
                <li><strong>Device Type:</strong> ${deviceType}</li>
                <li><strong>Time:</strong> ${timestamp.toLocaleString("en-US", { timeZone: "Asia/Manila" })}</li>
                <li><strong>IP Address:</strong> ${ip}</li>
              </ul>
              <p style="color: #666; font-size: 12px;">If this wasn't you, please change your password immediately or contact IT support.</p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send security alert email", err);
      }
    }

    // ─── Lock Account on 5th Failed Attempt ────────────────────────

    if (attempts >= 5) {
      await usersCollection.updateOne(
        { Email },
        { $set: { LoginAttempts: attempts, Status: "Locked", LockUntil: null } }
      );

      return res.status(403).json({
        message: "Account Is Locked. Submit your ticket to IT Department.",
        locked: true,
      });
    }

    // ─── Update Failed Attempt Count ────────────────────────────

    await usersCollection.updateOne(
      { Email },
      { $set: { LoginAttempts: attempts } }
    );

    return res.status(401).json({
      message: `Invalid credentials. Attempt ${attempts}/5`,
    });
  }

  /* =========================================
     SUCCESSFUL PASSWORD LOGIN
  ========================================= */

  const userId = result.user._id.toString();

  await usersCollection.updateOne(
    { Email },
    {
      $set: {
        DeviceId: deviceId,
        LoginAttempts: 0,
        Status: "Active",
        Connection: "Online",
      },
    }
  );

  res.setHeader(
    "Set-Cookie",
    serialize("session", userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    })
  );

  return res.status(200).json({
    message: "Login successful",
    userId,
    Role: user.Role,
    Department: user.Department,
    Status: user.Status,
    ReferenceID: user.ReferenceID,
    TSM: user.TSM,
    Manager: user.Manager,
  });
}