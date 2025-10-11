import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, updateSystemPrompt } from "@/lib/system-prompt";

export const runtime = "nodejs";

export async function GET() {
  try {
    const prompt = await getSystemPrompt();
    return NextResponse.json({ prompt }, { status: 200 });
  } catch (error) {
    console.error("[System Prompt API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load system prompt" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Invalid prompt provided" },
        { status: 400 }
      );
    }

    if (prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "Prompt is too short" },
        { status: 400 }
      );
    }

    await updateSystemPrompt(prompt);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[System Prompt API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update system prompt" },
      { status: 500 }
    );
  }
}
