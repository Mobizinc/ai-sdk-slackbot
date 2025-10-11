"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SystemPromptPage() {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/system-prompt");
      if (!response.ok) {
        throw new Error("Failed to load system prompt");
      }
      const data = await response.json();
      setPrompt(data.prompt);
      setOriginalPrompt(data.prompt);
      setMessage(null);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to load system prompt" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const response = await fetch("/api/system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save system prompt");
      }

      setOriginalPrompt(prompt);
      setMessage({ type: "success", text: "System prompt saved successfully" });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save system prompt",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(originalPrompt);
    setMessage(null);
  };

  const hasChanges = prompt !== originalPrompt;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading system prompt...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold mb-2">System Prompt Configuration</h1>
        <p className="text-muted-foreground">
          Configure the base system prompt that guides the AI agent's behavior and responses.
        </p>
      </div>

      {message && (
        <Alert
          variant={message.type === "error" ? "destructive" : "default"}
          className="mb-6"
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            This prompt is dynamically loaded and enhanced with business context when the agent
            responds. Changes take effect immediately on save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[500px] font-mono text-sm"
            placeholder="Enter the system prompt..."
          />

          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-600 font-medium">Unsaved changes</span>
              ) : (
                <span>No changes</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || saving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-medium mb-2">Tips:</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• The prompt should clearly define the agent's role, personality, and capabilities</li>
          <li>• Use specific examples to guide behavior in different scenarios</li>
          <li>• Define when to be proactive vs. passive in responses</li>
          <li>• Specify which tools to use and when to use them</li>
          <li>• Include response format guidelines for consistency</li>
        </ul>
      </div>
    </div>
  );
}
