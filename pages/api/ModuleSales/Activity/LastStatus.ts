import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

export default async function lastStatus(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { referenceId } = req.query;

    if (!referenceId || typeof referenceId !== "string" || !referenceId.trim()) {
      return res.status(400).json({ error: "referenceId query param is required" });
    }

    let db;
    try {
      db = await connectToDatabase();
    } catch (dbErr) {
      console.error("DB connection error:", dbErr);
      return res.status(503).json({ error: "Database connection failed. Please try again." });
    }

    const collection = db.collection("TaskLog");

    // Today's full range (midnight → 23:59:59)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const lastActivityToday = await collection.findOne(
      {
        ReferenceID: referenceId.trim(),
        date_created: { $gte: startOfToday, $lte: endOfToday },
      },
      {
        sort: { date_created: -1 },
        projection: { Status: 1, date_created: 1 },
      }
    );

    if (!lastActivityToday) {
      // Return explicit null — never 404 so the client can handle cleanly
      return res.status(200).json(null);
    }

    return res.status(200).json({
      Status:       lastActivityToday.Status       ?? null,
      date_created: lastActivityToday.date_created ?? null,
    });
  } catch (error) {
    console.error("Error fetching last status:", error);
    return res.status(500).json({ error: "Failed to fetch last status" });
  }
}