import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";
import { ObjectId } from "mongodb";
import { parse } from "cookie";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const cookies = parse(req.headers.cookie || "");
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const db = await connectToDatabase();
  const sessionsCollection = db.collection("sessions");
  const usersCollection = db.collection("users");

  const session = await sessionsCollection.findOne({ token: sessionToken });
  if (!session) {
    return res.status(401).json({ message: "Invalid session" });
  }

  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ message: "Enabled (boolean) is required" });
  }

  await usersCollection.updateOne(
    { _id: new ObjectId(session.userId) },
    { $set: { twoFactorEnabled: enabled } }
  );

  return res.status(200).json({ message: `2FA ${enabled ? "enabled" : "disabled"} successfully` });
}
