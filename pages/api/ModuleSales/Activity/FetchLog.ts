import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

interface ActivityLog {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  Location: string;
  Latitude: number;
  Longitude: number;
  date_created: string;
  PhotoURL?: string;
  Remarks: string;
  _id?: string;
}

export default async function fetchAccounts(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection("TaskLog");

    // Pagination params
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "100"); // default 100 per page
    const skip = (page - 1) * limit;

    // Role-based filtering
    const role = req.query.role as string; // Super Admin / HR
    const userReferenceID = req.query.referenceID as string; // normal user
    const query: any = {};

    if (!(role === "Super Admin" || role === "Human Resources") && userReferenceID) {
      query.ReferenceID = userReferenceID; // normal users only see their own
    }

    // Optional date filtering
    if (req.query.startDate && req.query.endDate) {
      query.date_created = {
        $gte: new Date(req.query.startDate as string),
        $lte: new Date(req.query.endDate as string),
      };
    }

    const totalLogs = await collection.countDocuments(query);

    const rawLogs = await collection
      .find(query, {
        projection: {
          ReferenceID: 1,
          Email: 1,
          Type: 1,
          Status: 1,
          Location: 1,
          Latitude: 1,
          Longitude: 1,
          date_created: 1,
          PhotoURL: 1,
          Remarks: 1,
        },
      })
      .sort({ date_created: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const logs: ActivityLog[] = rawLogs.map((doc) => ({
      ReferenceID: doc.ReferenceID,
      Email: doc.Email,
      Type: doc.Type,
      Status: doc.Status,
      Location: doc.Location,
      Latitude: doc.Latitude,
      Longitude: doc.Longitude,
      date_created: doc.date_created,
      PhotoURL: doc.PhotoURL,
      Remarks: doc.Remarks,
      _id: doc._id.toString(),
    }));

    res.status(200).json({
      data: logs,
      pagination: {
        page,
        limit,
        total: totalLogs,
        totalPages: Math.ceil(totalLogs / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
}
