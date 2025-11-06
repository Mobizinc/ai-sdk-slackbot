import { cn } from "@/lib/utils";
import { Label } from "../ui/label";

interface FieldGroupProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldGroup({
  label,
  description,
  required,
  error,
  children,
  className,
}: FieldGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-gray-900">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      </div>
      {description && <p className="text-sm text-gray-500">{description}</p>}
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
