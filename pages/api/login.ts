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
  const sessionsCollection = db.collection("sessions");

  let user = null;

  // --- Case 1: Biometric Login ---
  if (credentialId && !Password) {
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

    // Biometric is trusted, no 2FA needed usually, but we'll follow the same session logic
    const userId = user._id.toString();
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    const userAgent = req.headers["user-agent"] || "Unknown";
    const parser = new UAParser(userAgent);
    const os = parser.getOS().name || "Unknown OS";
    const device = parser.getDevice().model || parser.getDevice().type || "Desktop";

    await sessionsCollection.insertOne({
      userId,
      token: sessionToken,
      deviceId,
      userAgent,
      os,
      device,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      lastActive: new Date(),
      createdAt: new Date(),
    });

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
      serialize("session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7, // 7 days
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

  user = await usersCollection.findOne({ Email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  // Check 2FA requirement
  if (user.twoFactorEnabled && !req.body.otp) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { otp, otpExpiry } }
    );

    // Send OTP via email
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Acculog Security" <${process.env.EMAIL_USER}>`,
        to: user.Email,
        subject: "Your 2FA Verification Code",
        text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #CC1318;">Acculog Security</h2>
            <p>You are attempting to log in to your Acculog account. Please use the verification code below to complete your sign-in:</p>
            <div style="font-size: 32px; font-weight: bold; color: #CC1318; letter-spacing: 5px; margin: 20px 0;">${otp}</div>
            <p style="color: #666; font-size: 12px;">This code will expire in 10 minutes. If you did not request this code, please secure your account immediately.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error("Failed to send 2FA email", e);
    }

    return res.status(200).json({ twoFactorRequired: true, message: "OTP sent to your email." });
  }

  // If 2FA is provided, verify it
  if (user.twoFactorEnabled && req.body.otp) {
    if (user.otp !== req.body.otp || new Date() > new Date(user.otpExpiry)) {
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }
    // Clear OTP after successful verification
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { otp: null, otpExpiry: null } }
    );
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
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const userAgent = req.headers["user-agent"] || "Unknown";
    const parser = new UAParser(userAgent);
    const os = parser.getOS().name || "Unknown OS";
    const device = parser.getDevice().model || parser.getDevice().type || "Desktop";

    await sessionsCollection.insertOne({
      userId,
      token: sessionToken,
      deviceId,
      userAgent,
      os,
      device,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      lastActive: new Date(),
      createdAt: new Date(),
    });

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
      serialize("session", sessionToken, {
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
  const os = parser.getOS().name || "Unknown OS";
  const device = parser.getDevice().model || parser.getDevice().type || "Desktop";

  if (!result.success || !result.user) {
    const attempts = (user.LoginAttempts || 0) + 1;

    // ─── Security Alert on 2nd Failed Attempt ────────────────────────
    if (attempts === 2) {
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "Unknown IP";
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
          from: `"Acculog Security" <${process.env.EMAIL_USER}>`,
          to: user.Email,
          subject: "Security Alert: Failed Login Attempt",
          text: `We detected 2 failed login attempts on your Acculog account from device: ${device} (${os}). If this wasn't you, please reset your password immediately.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #CC1318;">Security Alert</h2>
              <p>We detected multiple failed login attempts on your account.</p>
              <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Device:</strong> ${device} (${os})</p>
                <p><strong>IP Address:</strong> ${ip}</p>
                <p><strong>Time:</strong> ${timestamp.toLocaleString()}</p>
              </div>
              <p>If this was not you, please contact your administrator or reset your password immediately.</p>
            </div>
          `,
        });
      } catch (e) {
        console.error("Failed to send security alert email", e);
      }
    }

    if (attempts >= 5) {
      await usersCollection.updateOne({ Email }, { $set: { Status: "Locked", LoginAttempts: attempts } });
      return res.status(403).json({ message: "Account Locked due to too many failed attempts." });
    }

    await usersCollection.updateOne({ Email }, { $set: { LoginAttempts: attempts } });
    return res.status(401).json({ message: "Invalid email or password." });
  } else {
    // Successful login
    const userId = result.user._id.toString();
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

    await sessionsCollection.insertOne({
      userId,
      token: sessionToken,
      deviceId,
      userAgent,
      os,
      device,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      lastActive: new Date(),
      createdAt: new Date(),
    });

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
      serialize("session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      })
    );

    return res.status(200).json({
      message: "Login successful",
      userId,
      Role: result.user.Role,
      Department: result.user.Department,
      Status: result.user.Status,
      ReferenceID: result.user.ReferenceID,
      TSM: result.user.TSM,
      Manager: result.user.Manager,
    });
  }
}