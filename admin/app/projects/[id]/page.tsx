"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { apiClient, type Project, type ProjectWithRelations } from "@/lib/api-client";
import { EditableSection } from "@/components/projects/EditableSection";
import { FieldGroup } from "@/components/projects/FieldGroup";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";

type ProjectFormState = Partial<Project>;
type EditableField =
  | "name"
  | "status"
  | "summary"
  | "background"
  | "techStack"
  | "skillsRequired"
  | "skillsNiceToHave"
  | "difficultyLevel"
  | "estimatedHours"
  | "learningOpportunities"
  | "openTasks"
  | "mentorSlackUserId"
  | "mentorName";

const extractProjectFields = (item: ProjectWithRelations): Project =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (({ standups, interviews, initiations, evaluations, ...rest }) => rest)(item) as Project;

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [editingSections, setEditingSections] = useState<Record<string, boolean>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProjectFormState>({});

  const loadProject = useCallback(async () => {
    try {
      const data = await apiClient.getProject(projectId);
      setProject(data);
      setFormData(extractProjectFields(data));
    } catch (error) {
      console.error("Failed to load project:", error);
      toast.error("Failed to load project");
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadProject();
  }, [projectId, loadProject]);

  const startEditing = (section: string) => {
    setEditingSections((prev) => ({ ...prev, [section]: true }));
  };

  const cancelEditing = (section: string) => {
    setEditingSections((prev) => ({ ...prev, [section]: false }));
    if (project) {
      setFormData(extractProjectFields(project));
    }
  };

  const saveSection = async (section: string, fields: EditableField[]) => {
    try {
      setSavingSection(section);
      const updates: Partial<Project> = {};
      fields.forEach((field) => {
        const value = formData[field];
        if (value !== undefined) {
          (updates as Record<EditableField, Project[EditableField]>)[field] =
            value as Project[EditableField];
        }
      });

      const result = await apiClient.updateProject(projectId, updates);
      setProject((prev) => (prev ? { ...prev, ...result.project } : prev));
      setFormData((prev) => ({ ...prev, ...result.project }));
      setEditingSections((prev) => ({ ...prev, [section]: false }));
      toast.success("Project updated successfully");
    } catch (error) {
      console.error("Failed to update project:", error);
      toast.error("Failed to update project");
    } finally {
      setSavingSection(null);
    }
  };

  const updateField = <K extends keyof ProjectFormState>(field: K, value: ProjectFormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  type ProjectArrayField =
    | "techStack"
    | "skillsRequired"
    | "skillsNiceToHave"
    | "learningOpportunities"
    | "openTasks";

  const addArrayItem = (field: ProjectArrayField, value: string) => {
    if (!value.trim()) return;
    const nextValues = [...((formData[field] as string[] | undefined) ?? []), value.trim()];
    updateField(field, nextValues);
  };

  const removeArrayItem = (field: ProjectArrayField, index: number) => {
    const current = (formData[field] as string[] | undefined) ?? [];
    updateField(field, current.filter((_, i) => i !== index));
  };

  if (!project) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Section */}
      <EditableSection
        title="Summary"
        isEditing={editingSections.summary}
        onEdit={() => startEditing("summary")}
        onCancel={() => cancelEditing("summary")}
        onSave={() => saveSection("summary", ["name", "status", "summary"])}
        isSaving={savingSection === "summary"}
      >
        {editingSections.summary ? (
          <div className="space-y-4">
            <FieldGroup label="Project Name" required>
              <Input
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Status" required>
              <Select value={formData.status} onChange={(e) => updateField("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
            </FieldGroup>
            <FieldGroup label="Summary" required>
              <Textarea
                value={formData.summary}
                onChange={(e) => updateField("summary", e.target.value)}
                rows={3}
              />
            </FieldGroup>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-500">Name:</span>
              <p className="text-gray-900">{project.name}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Summary:</span>
              <p className="text-gray-900">{project.summary}</p>
            </div>
          </div>
        )}
      </EditableSection>

      {/* Background Section */}
      <EditableSection
        title="Background"
        isEditing={editingSections.background}
        onEdit={() => startEditing("background")}
        onCancel={() => cancelEditing("background")}
        onSave={() => saveSection("background", ["background"])}
        isSaving={savingSection === "background"}
      >
        {editingSections.background ? (
          <FieldGroup label="Background">
            <Textarea
              value={formData.background || ""}
              onChange={(e) => updateField("background", e.target.value)}
              rows={6}
              placeholder="Provide detailed context, goals, and background information..."
            />
          </FieldGroup>
        ) : (
          <div className="prose max-w-none">
            <p className="text-gray-900 whitespace-pre-wrap">
              {project.background || <span className="text-gray-400 italic">No background provided</span>}
            </p>
          </div>
        )}
      </EditableSection>

      {/* Technical Details */}
      <EditableSection
        title="Technical Details"
        isEditing={editingSections.technical}
        onEdit={() => startEditing("technical")}
        onCancel={() => cancelEditing("technical")}
        onSave={() =>
          saveSection("technical", [
            "techStack",
            "skillsRequired",
            "skillsNiceToHave",
            "difficultyLevel",
            "estimatedHours",
          ])
        }
        isSaving={savingSection === "technical"}
      >
        {editingSections.technical ? (
          <div className="space-y-4">
            <FieldGroup label="Tech Stack">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(formData.techStack || []).map((tech: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-800 text-sm"
                    >
                      {tech}
                      <button onClick={() => removeArrayItem("techStack", i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder="Add technology (press Enter)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArrayItem("techStack", (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Difficulty Level">
                <Select
                  value={formData.difficultyLevel || ""}
                  onChange={(e) => updateField("difficultyLevel", e.target.value)}
                >
                  <option value="">Select difficulty</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </Select>
              </FieldGroup>

              <FieldGroup label="Estimated Hours">
                <Input
                  value={formData.estimatedHours || ""}
                  onChange={(e) => updateField("estimatedHours", e.target.value)}
                  placeholder="e.g., 40-60 hours"
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Required Skills">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(formData.skillsRequired || []).map((skill: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-800 text-sm"
                    >
                      {skill}
                      <button onClick={() => removeArrayItem("skillsRequired", i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder="Add required skill (press Enter)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArrayItem("skillsRequired", (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </FieldGroup>

            <FieldGroup label="Nice-to-Have Skills">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(formData.skillsNiceToHave || []).map((skill: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm"
                    >
                      {skill}
                      <button onClick={() => removeArrayItem("skillsNiceToHave", i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder="Add nice-to-have skill (press Enter)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArrayItem("skillsNiceToHave", (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </FieldGroup>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-gray-700">Tech Stack</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {project.techStack.length > 0 ? (
                  project.techStack.map((tech, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-sm">
                      {tech}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-sm">No tech stack defined</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-700">Difficulty</span>
                <p className="text-gray-900 mt-1 capitalize">{project.difficultyLevel || "Not specified"}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Estimated Hours</span>
                <p className="text-gray-900 mt-1">{project.estimatedHours || "Not specified"}</p>
              </div>
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">Required Skills</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {project.skillsRequired.length > 0 ? (
                  project.skillsRequired.map((skill, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-green-100 text-green-800 text-sm">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-sm">No required skills</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">Nice-to-Have Skills</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {project.skillsNiceToHave.length > 0 ? (
                  project.skillsNiceToHave.map((skill, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-sm">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-sm">No nice-to-have skills</span>
                )}
              </div>
            </div>
          </div>
        )}
      </EditableSection>

      {/* Mentor Assignment */}
      <EditableSection
        title="Mentor Assignment"
        isEditing={editingSections.mentor}
        onEdit={() => startEditing("mentor")}
        onCancel={() => cancelEditing("mentor")}
        onSave={() => saveSection("mentor", ["mentorSlackUserId", "mentorName"])}
        isSaving={savingSection === "mentor"}
      >
        {editingSections.mentor ? (
          <div className="space-y-4">
            <FieldGroup label="Mentor Slack User ID">
              <Input
                value={formData.mentorSlackUserId || ""}
                onChange={(e) => updateField("mentorSlackUserId", e.target.value)}
                placeholder="e.g., U01234ABCDE"
              />
            </FieldGroup>
            <FieldGroup label="Mentor Name">
              <Input
                value={formData.mentorName || ""}
                onChange={(e) => updateField("mentorName", e.target.value)}
                placeholder="e.g., John Doe"
              />
            </FieldGroup>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-500">Mentor:</span>
              <p className="text-gray-900">{project.mentorName || <span className="text-gray-400 italic">Not assigned</span>}</p>
            </div>
            {project.mentorSlackUserId && (
              <div>
                <span className="text-sm font-medium text-gray-500">Slack ID:</span>
                <p className="text-gray-900 font-mono text-sm">{project.mentorSlackUserId}</p>
              </div>
            )}
          </div>
        )}
      </EditableSection>

      {/* Open Tasks */}
      <EditableSection
        title="Open Tasks"
        isEditing={editingSections.tasks}
        onEdit={() => startEditing("tasks")}
        onCancel={() => cancelEditing("tasks")}
        onSave={() => saveSection("tasks", ["openTasks"])}
        isSaving={savingSection === "tasks"}
      >
        {editingSections.tasks ? (
          <div className="space-y-2">
            {(formData.openTasks || []).map((task: string, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <span className="text-sm">{task}</span>
                <button onClick={() => removeArrayItem("openTasks", i)}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            ))}
            <Input
              placeholder="Add task (press Enter)"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addArrayItem("openTasks", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {project.openTasks.length > 0 ? (
              project.openTasks.map((task, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                  <span className="text-orange-600 mt-0.5">•</span>
                  <span className="text-sm text-gray-900 flex-1">{task}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-400 italic text-sm">No open tasks</p>
            )}
          </div>
        )}
      </EditableSection>

      {/* Learning Opportunities */}
      <EditableSection
        title="Learning Opportunities"
        isEditing={editingSections.learning}
        onEdit={() => startEditing("learning")}
        onCancel={() => cancelEditing("learning")}
        onSave={() => saveSection("learning", ["learningOpportunities"])}
        isSaving={savingSection === "learning"}
      >
        {editingSections.learning ? (
          <div className="space-y-2">
            {(formData.learningOpportunities || []).map((opp: string, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 bg-purple-50 rounded">
                <span className="text-sm">{opp}</span>
                <button onClick={() => removeArrayItem("learningOpportunities", i)}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            ))}
            <Input
              placeholder="Add learning opportunity (press Enter)"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addArrayItem("learningOpportunities", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {project.learningOpportunities.length > 0 ? (
              project.learningOpportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                  <span className="text-purple-600 mt-0.5">✓</span>
                  <span className="text-sm text-gray-900 flex-1">{opp}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-400 italic text-sm">No learning opportunities defined</p>
            )}
          </div>
        )}
      </EditableSection>
    </div>
  );
}
