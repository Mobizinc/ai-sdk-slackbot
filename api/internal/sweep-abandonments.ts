import { sweepAbandonedInterviews } from "../../lib/projects/interview-abandonment-service";

function authorize(request: Request): Response | null {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) {
    return null;
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await sweepAbandonedInterviews();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
