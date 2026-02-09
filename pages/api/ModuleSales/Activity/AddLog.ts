import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

export default async function addActivityLog(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const {
      ReferenceID,
      Email,
      Type,
      Status,
      Location,
      Latitude,
      Longitude,
      PhotoURL,
      Remarks,
      TSM,
    } = req.body;

    if (!ReferenceID || !Email || !Type || !Status) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await connectToDatabase();
    const activityLogsCollection = db.collection("TaskLog");

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(8, 0, 0, 0);
    if (now < startOfDay) {
      startOfDay.setDate(startOfDay.getDate() - 1);
    }
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setMilliseconds(-1);

    const lastActivityToday = await activityLogsCollection.findOne(
      {
        ReferenceID,
        date_created: { $gte: startOfDay, $lte: endOfDay },
      },
      { sort: { date_created: -1 } }
    );

    if (
      lastActivityToday?.Status === Status &&
      lastActivityToday?.Type === Type
    ) {
      return res.status(409).json({
        error: `You are already ${Status.toLowerCase()} for ${Type}.`,
      });
    }

    if (Status === "Login") {
      const loginCount = await activityLogsCollection.countDocuments({
        ReferenceID,
        Status: "Login",
        date_created: { $gte: startOfDay, $lte: endOfDay },
      });

      if (loginCount >= 20) {
        return res.status(403).json({
          error: "Daily 20 Login limit reached. Resets at 8:00 AM.",
        });
      }
    }

    if (Type === "Site Visit") {
      const siteVisitCount = await activityLogsCollection.countDocuments({
        ReferenceID,
        Type: "Site Visit",
        date_created: { $gte: startOfDay, $lte: endOfDay },
      });

      if (siteVisitCount >= 20) {
        return res.status(403).json({
          error: "Daily 20 Site Visit limit reached. Resets at 8:00 AM.",
        });
      }
    }

    const newLog: any = {
      ReferenceID,
      Email,
      Type,
      Status,
      Remarks,
      TSM,
      date_created: new Date(),
    };

    if (Location) newLog.Location = Location;
    if (Latitude) newLog.Latitude = Latitude;
    if (Longitude) newLog.Longitude = Longitude;
    if (PhotoURL) newLog.PhotoURL = PhotoURL;

    const result = await activityLogsCollection.insertOne(newLog);

    if (!result.acknowledged) {
      throw new Error("Failed to insert new log");
    }

    return res.status(201).json({
      message: `${Status} recorded successfully`,
    });
  } catch (error) {
    console.error("Error adding activity log:", error);
    return res.status(500).json({ error: "Failed to add activity log" });
  }
}
