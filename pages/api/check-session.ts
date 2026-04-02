// pages/api/check-session.ts

import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";
import { parse } from "cookie";
import { ObjectId } from "mongodb";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
    const sessionToken = cookies.session;

    if (!sessionToken) {
        return res.status(401).json({ message: "No session token" });
    }

    const db = await connectToDatabase();
    const users = db.collection("users");
    const sessions = db.collection("sessions");

    // 1. Find the session in the DB
    const sessionDoc = await sessions.findOne({ token: sessionToken });
    if (!sessionDoc) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }

    // 2. Check deviceId match (extra security)
    const deviceId = req.headers["x-device-id"];
    if (sessionDoc.deviceId && deviceId && sessionDoc.deviceId !== deviceId) {
        return res.status(401).json({ message: "Device mismatch. Please login again." });
    }

    // 3. Find the user associated with the session
    const user = await users.findOne({ _id: new ObjectId(sessionDoc.userId) });
    if (!user) {
        return res.status(401).json({ message: "User not found" });
    }

    // 3. Update last active
    await sessions.updateOne(
        { _id: sessionDoc._id },
        { $set: { lastActive: new Date() } }
    );

    return res.status(200).json({ message: "Session valid", user });
}
