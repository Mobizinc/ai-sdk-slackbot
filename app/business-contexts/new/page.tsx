"use client";

import { useRouter } from "next/navigation";
import { NewBusinessContext } from "@/lib/db/schema";
import { ContextForm } from "@/components/business-context/ContextForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewBusinessContextPage() {
  const router = useRouter();

  const handleSubmit = async (data: NewBusinessContext) => {
    try {
      const response = await fetch("/api/business-contexts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to create context");
      }

      router.push("/business-contexts");
    } catch (error) {
      console.error("Error creating context:", error);
      alert("Failed to create context. Please try again.");
    }
  };

  const handleCancel = () => {
    router.push("/business-contexts");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Business Context</h1>
          <p className="text-muted-foreground mt-1">
            Add a new business entity to the context database
          </p>
        </div>
      </div>

      <ContextForm onSubmit={handleSubmit} onCancel={handleCancel} />
    </div>
  );
}
