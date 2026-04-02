import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";
import { ObjectId } from "mongodb";
import { parse } from "cookie";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || "");
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const db = await connectToDatabase();
  const sessionsCollection = db.collection("sessions");
  
  // Find current session to get userId
  const currentSession = await sessionsCollection.findOne({ token: sessionToken });
  if (!currentSession) {
    return res.status(401).json({ message: "Invalid session" });
  }

  const userId = currentSession.userId;

  if (req.method === "GET") {
    // List all sessions for this user
    const sessions = await sessionsCollection.find({ userId }).sort({ lastActive: -1 }).toArray();
    return res.status(200).json(sessions);
  }

  if (req.method === "DELETE") {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID required" });
    }

    // Don't allow revoking the current session via this endpoint (should use logout)
    if (sessionId === currentSession._id.toString()) {
        return res.status(400).json({ message: "Cannot revoke current session here. Use logout." });
    }

    await sessionsCollection.deleteOne({ _id: new ObjectId(sessionId), userId });
    return res.status(200).json({ message: "Session revoked" });
  }

  return res.status(405).json({ message: "Method not allowed" });
}
