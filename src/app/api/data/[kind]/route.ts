import { z } from "zod";
import { getSession, logAudit } from "@/lib/server";
import { createRecord, listRecords } from "@/lib/server/data";
import { errorResponse, HttpError } from "@/lib/server/core";

export const dynamic = "force-dynamic";
const createSchema = z.object({ id: z.string().min(2).max(120), data: z.record(z.string(), z.unknown()) });

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const user = await getSession();
    if (!user) throw new HttpError(401, "Unauthorized");
    const { kind } = await context.params;
    const records = await listRecords(user, kind, new URL(request.url).searchParams);
    return Response.json({ records, items: records });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const user = await getSession();
    if (!user) throw new HttpError(401, "Unauthorized");
    const { kind } = await context.params;
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid record data");
    const record = await createRecord(user, kind, parsed.data);
    await logAudit(user, "record.created_or_replayed", kind, record.id);
    return Response.json({ record, item: record });
  } catch (error) { return errorResponse(error); }
}
