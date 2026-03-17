import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

export default async function loginSummary(
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

    // ── Manila time day window (UTC+8) ────────────────────────────────────────
    const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowUTC = Date.now();

    // Current time in Manila
    const manilaMs = nowUTC + MANILA_OFFSET_MS;
    const manilaDate = new Date(manilaMs);

    // Midnight Manila today → convert back to UTC for query
    const manilaStartOfDay = new Date(manilaDate);
    manilaStartOfDay.setHours(0, 0, 0, 0);
    const startUTC = new Date(manilaStartOfDay.getTime() - MANILA_OFFSET_MS);

    // 23:59:59.999 Manila today → convert back to UTC
    const manilaEndOfDay = new Date(manilaDate);
    manilaEndOfDay.setHours(23, 59, 59, 999);
    const endUTC = new Date(manilaEndOfDay.getTime() - MANILA_OFFSET_MS);

    const dateFilter = { $gte: startUTC, $lte: endUTC };
    const ref = referenceId.trim();

    // Run last-activity lookup and login count in parallel
    const [last, loginCount] = await Promise.all([
      collection.findOne(
        { ReferenceID: ref, date_created: dateFilter },
        {
          sort: { date_created: -1 },
          projection: { Status: 1, date_created: 1 },
        }
      ),
      collection.countDocuments({
        ReferenceID: ref,
        Status: "Login",
        date_created: dateFilter,
      }),
    ]);

    return res.status(200).json({
      lastStatus: last?.Status       ?? null,
      lastTime:   last?.date_created ?? null,
      loginCount,
    });
  } catch (error) {
    console.error("Error fetching login summary:", error);
    return res.status(500).json({ error: "Failed to fetch login summary" });
  }
}