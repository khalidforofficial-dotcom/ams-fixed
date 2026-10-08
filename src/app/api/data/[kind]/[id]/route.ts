import { z } from "zod";
import { getSession, logAudit } from "@/lib/server";
import { getRecord, updateRecord } from "@/lib/server/data";
import { errorResponse, HttpError } from "@/lib/server/core";

export const dynamic = "force-dynamic";
const patchSchema = z.object({ data: z.record(z.string(), z.unknown()) });

export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const user = await getSession();
    if (!user) throw new HttpError(401, "Unauthorized");
    const { kind, id } = await context.params;
    const record = await getRecord(user, kind, id);
    if (!record) throw new HttpError(404, "Record not found");
    return Response.json({ record, item: record });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const user = await getSession();
    if (!user) throw new HttpError(401, "Unauthorized");
    const { kind, id } = await context.params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid record data");
    const record = await updateRecord(user, kind, id, parsed.data.data);
    await logAudit(user, "record.updated", kind, id, { fields: Object.keys(parsed.data.data) });
    return Response.json({ record, item: record });
  } catch (error) { return errorResponse(error); }
}
