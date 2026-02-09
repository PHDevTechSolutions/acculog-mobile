import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { referenceId } = req.query;
  if (!referenceId) {
    return res.status(400).json({ error: "Missing referenceId" });
  }

  const db = await connectToDatabase();
  const col = db.collection("TaskLog");

  // 🕒 Same 8AM window logic
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(8, 0, 0, 0);
  if (now < startOfDay) startOfDay.setDate(startOfDay.getDate() - 1);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setMilliseconds(-1);

  // Last activity
  const last = await col.findOne(
    {
      ReferenceID: referenceId,
      date_created: { $gte: startOfDay, $lte: endOfDay },
    },
    { sort: { date_created: -1 } }
  );

  // Count logins
  const loginCount = await col.countDocuments({
    ReferenceID: referenceId,
    Status: "Login",
    date_created: { $gte: startOfDay, $lte: endOfDay },
  });

  return res.json({
    lastStatus: last?.Status ?? null,
    lastTime: last?.date_created ?? null,
    loginCount,
  });
}
