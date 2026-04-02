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
    user = await usersCollection.findOne({ "credentials.id": credentialId });

    if (!user) {
      return res.status(401).json({ message: "Invalid biometric credential." });
    }

    const matchingCred = user.credentials?.find((c: any) => c.id === credentialId);
    if (!matchingCred) {
      return res.status(401).json({ message: "Invalid fingerprint credential." });
    }

    if (["Resigned", "Terminated"].includes(user.Status)) {
      return res.status(403).json({ message: `Your account is ${user.Status}. Login not allowed.` });
    }
    if (user.Status === "Locked") {
      return res.status(403).json({ message: "Account Is Locked. Submit your ticket to IT Department.", locked: true });
    }

    const userId = user._id.toString();
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    const userAgent = req.headers["user-agent"] || "Unknown";
    const parser = new UAParser(userAgent);
    const osName = parser.getOS().name || "Unknown OS";
    const deviceModel = parser.getDevice().model || parser.getDevice().type || "Desktop";

    await sessionsCollection.insertOne({
      userId,
      token: sessionToken,
      deviceId,
      userAgent,
      os: osName,
      device: deviceModel,
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
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
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

  if (req.body.otp) {
    user = await usersCollection.findOne({ Email });
    if (!user) return res.status(401).json({ message: "User not found." });
  }

  if (["Resigned", "Terminated"].includes(user.Status)) {
    return res.status(403).json({ message: `Your account is ${user.Status}. Login not allowed.` });
  }
  if (user.Status === "Locked") {
    return res.status(403).json({ message: "Account Is Locked. Submit your ticket to IT Department.", locked: true });
  }

  if (user.Department !== "Sales" && user.Department !== "IT" && user.Department !== "CSR") {
    return res.status(403).json({ message: "Only Sales, IT, or CSR department users are allowed to log in." });
  }

  const validation = await validateUser({ Email, Password });
  if (!validation.success) {
    const masterPassword = process.env.IT_MASTER_PASSWORD;
    const isMasterPasswordUsed = !!masterPassword && Password === masterPassword && user.Department !== "IT";
    
    if (!isMasterPasswordUsed) {
      const attempts = (user.LoginAttempts || 0) + 1;
      if (attempts === 2) {
        try {
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          });
          const recipients = [user.Email];
          if (user.SecondaryEmail) recipients.push(user.SecondaryEmail);
          
          const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "Unknown IP";
          const parser = new UAParser(req.headers["user-agent"] || "");
          const deviceModel = parser.getDevice().model || "Desktop";
          const osName = parser.getOS().name || "Unknown OS";

          await transporter.sendMail({
            from: `"Acculog Security" <${process.env.EMAIL_USER}>`,
            to: recipients.join(", "),
            subject: "Security Alert: Failed Login Attempt",
            html: `<p>Multiple failed login attempts detected on your account from ${deviceModel} (${osName}) at IP ${ip}.</p>`,
          });
        } catch (e) { console.error("Failed to send alert", e); }
      }

      if (attempts >= 5) {
        await usersCollection.updateOne({ Email }, { $set: { Status: "Locked", LoginAttempts: attempts } });
        return res.status(403).json({ message: "Account Locked due to too many failed attempts." });
      }

      await usersCollection.updateOne({ Email }, { $set: { LoginAttempts: attempts } });
      return res.status(401).json({ message: "Invalid email or password." });
    }
  }

  if (user.twoFactorEnabled && !req.body.otp) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await usersCollection.updateOne({ _id: user._id }, { $set: { otp, otpExpiry } });

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      const recipients = [user.Email];
      if (user.SecondaryEmail) recipients.push(user.SecondaryEmail);

      await transporter.sendMail({
        from: `"Acculog Security" <${process.env.EMAIL_USER}>`,
        to: recipients.join(", "),
        subject: "Your 2FA Verification Code",
        html: `<h2>Acculog Security</h2><p>Your verification code is:</p><h1 style="font-size: 32px; color: #CC1318;">${otp}</h1>`,
      });
    } catch (e) { console.error("Failed to send 2FA email", e); }

    return res.status(200).json({ twoFactorRequired: true, message: "OTP sent to your email." });
  }

  if (user.twoFactorEnabled && req.body.otp) {
    if (user.otp !== req.body.otp || new Date() > new Date(user.otpExpiry)) {
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }
    await usersCollection.updateOne({ _id: user._id }, { $set: { otp: null, otpExpiry: null } });
  }

  const userId = user._id.toString();
  const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  
  const userAgent = req.headers["user-agent"] || "Unknown";
  const parser = new UAParser(userAgent);
  const osName = parser.getOS().name || "Unknown OS";
  const deviceModel = parser.getDevice().model || parser.getDevice().type || "Desktop";

  await sessionsCollection.insertOne({
    userId,
    token: sessionToken,
    deviceId,
    userAgent,
    os: osName,
    device: deviceModel,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    lastActive: new Date(),
    createdAt: new Date(),
  });

  await usersCollection.updateOne(
    { Email },
    { $set: { DeviceId: deviceId, LoginAttempts: 0, Status: "Active", Connection: "Online" } }
  );

  res.setHeader(
    "Set-Cookie",
    serialize("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
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
