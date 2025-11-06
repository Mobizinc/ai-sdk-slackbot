"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Edit2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableSectionProps {
  title: string;
  isEditing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  children: React.ReactNode;
  className?: string;
  canEdit?: boolean;
  isSaving?: boolean;
}

export function EditableSection({
  title,
  isEditing = false,
  onEdit,
  onSave,
  onCancel,
  children,
  className,
  canEdit = true,
  isSaving = false,
}: EditableSectionProps) {
  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-6", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        {canEdit && (
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onEdit}
                className="gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
