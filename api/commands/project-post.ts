import { verifyRequest } from "../../lib/slack-utils";
import { handleProjectPostCommand } from "../../lib/projects/project-post-command";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verificationResult = await verifyRequest({
    requestType: "command",
    request,
    rawBody,
  });

  if (verificationResult instanceof Response) {
    return verificationResult;
  }

  const params = new URLSearchParams(rawBody);

  const commandPayload = {
    text: params.get("text") ?? "",
    userId: params.get("user_id") ?? "",
    userName: params.get("user_name") ?? "",
    channelId: params.get("channel_id") ?? "",
    channelName: params.get("channel_name") ?? undefined,
    responseUrl: params.get("response_url") ?? undefined,
  };

  try {
    const result = await handleProjectPostCommand(commandPayload);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[Project Post Command] Failed to post project", error);
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Something went wrong while posting that project. Please try again or contact the platform team.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
