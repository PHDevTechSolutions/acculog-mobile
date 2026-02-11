import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const { referenceId } = req.query;
  if (!referenceId) return res.status(400).json({ error: "Missing referenceId" });

  const db = await connectToDatabase();
  const col = db.collection("TaskLog");

  // Get current date in Asia/Manila
  const now = new Date();
  const offset = 8 * 60; // Manila UTC+8 in minutes
  const local = new Date(now.getTime() + offset * 60 * 1000);

  const startOfDay = new Date(local);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(local);
  endOfDay.setHours(23, 59, 59, 999);

  // Convert back to UTC for MongoDB query
  const startUTC = new Date(startOfDay.getTime() - offset * 60 * 1000);
  const endUTC = new Date(endOfDay.getTime() - offset * 60 * 1000);

  // Last activity
  const last = await col.findOne(
    {
      ReferenceID: referenceId,
      date_created: { $gte: startUTC, $lte: endUTC },
    },
    { sort: { date_created: -1 } }
  );

  // Count logins
  const loginCount = await col.countDocuments({
    ReferenceID: referenceId,
    Status: "Login",
    date_created: { $gte: startUTC, $lte: endUTC },
  });

  return res.json({
    lastStatus: last?.Status ?? null,
    lastTime: last?.date_created ?? null,
    loginCount,
  });
}
