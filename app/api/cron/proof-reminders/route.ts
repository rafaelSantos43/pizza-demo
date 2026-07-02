import { getServerEnv } from "@/lib/env";
import { runProofReminders } from "@/features/payments/proof-reminders/run";

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const token = auth.slice("Bearer ".length);
    if (token !== getServerEnv().CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await runProofReminders();
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[cron:proof-reminders] handler threw", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
