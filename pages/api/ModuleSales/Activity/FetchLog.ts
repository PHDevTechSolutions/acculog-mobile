import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase } from "@/lib/MongoDB";

interface ActivityLog {
  ReferenceID: string;
  Email: string;
  Type: string;
  Status: string;
  Location: string;
  Latitude: string;
  Longitude: string;
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

    const rawLogs = await collection
      .find({}, {
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
      .limit(100)
      .toArray();

    // Map raw MongoDB documents to ActivityLog[]
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
      _id: doc._id.toString(), // convert ObjectId to string
    }));

    res.status(200).json({ data: logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
}
