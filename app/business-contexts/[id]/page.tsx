"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { BusinessContext, NewBusinessContext } from "@/lib/db/schema";
import { ContextForm } from "@/components/business-context/ContextForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

export default function EditBusinessContextPage() {
  const router = useRouter();
  const params = useParams();
  const contextId = params.id as string;

  const [context, setContext] = useState<BusinessContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContext();
  }, [contextId]);

  const fetchContext = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/business-contexts/${contextId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch context");
      }

      const data = await response.json();
      setContext(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load context");
      console.error("Error fetching context:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (data: NewBusinessContext) => {
    try {
      const response = await fetch(`/api/business-contexts/${contextId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update context");
      }

      router.push("/business-contexts");
    } catch (error) {
      console.error("Error updating context:", error);
      alert("Failed to update context. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this context? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/business-contexts/${contextId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete context");
      }

      router.push("/business-contexts");
    } catch (error) {
      console.error("Error deleting context:", error);
      alert("Failed to delete context. Please try again.");
    }
  };

  const handleCancel = () => {
    router.push("/business-contexts");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-destructive mb-2">Error Loading Context</h2>
          <p className="text-sm text-muted-foreground">{error || "Context not found"}</p>
        </div>
        <Button onClick={() => router.push("/business-contexts")}>Back to Contexts</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Business Context</h1>
            <p className="text-muted-foreground mt-1">
              Update information for {context.entityName}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      <ContextForm
        context={context}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}
