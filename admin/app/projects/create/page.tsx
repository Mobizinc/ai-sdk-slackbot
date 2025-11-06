"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { FieldGroup } from "@/components/projects/FieldGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ProjectFormData {
  id: string;
  name: string;
  status: string;
  summary: string;
  background: string;
  githubUrl: string;
  githubRepo: string;
  githubDefaultBranch: string;
  techStack: string[];
  skillsRequired: string[];
  skillsNiceToHave: string[];
  difficultyLevel: string;
  estimatedHours: string;
  learningOpportunities: string[];
  openTasks: string[];
  mentorSlackUserId: string;
  mentorName: string;
  channelId: string;
  maxCandidates: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>({
    id: "",
    name: "",
    status: "draft",
    summary: "",
    background: "",
    githubUrl: "",
    githubRepo: "",
    githubDefaultBranch: "main",
    techStack: [],
    skillsRequired: [],
    skillsNiceToHave: [],
    difficultyLevel: "intermediate",
    estimatedHours: "",
    learningOpportunities: [],
    openTasks: [],
    mentorSlackUserId: "",
    mentorName: "",
    channelId: "",
    maxCandidates: "",
  });

  const [techStackInput, setTechStackInput] = useState("");
  const [skillsRequiredInput, setSkillsRequiredInput] = useState("");
  const [skillsNiceInput, setSkillsNiceInput] = useState("");
  const [learningOppInput, setLearningOppInput] = useState("");
  const [openTaskInput, setOpenTaskInput] = useState("");

  const updateField = (field: keyof ProjectFormData, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const addArrayItem = (field: keyof ProjectFormData, value: string, clearInput: () => void) => {
    if (!value.trim()) return;
    const currentArray = formData[field] as string[];
    updateField(field, [...currentArray, value.trim()]);
    clearInput();
  };

  const removeArrayItem = (field: keyof ProjectFormData, index: number) => {
    const currentArray = formData[field] as string[];
    updateField(
      field,
      currentArray.filter((_, i) => i !== index)
    );
  };

  const parseGitHubUrl = (url: string) => {
    if (!url) return;

    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      const [, owner, repo] = match;
      updateField("githubRepo", `${owner}/${repo.replace(/\.git$/, "")}`);
    }
  };

  const handleSave = async (activateNow: boolean = false) => {
    // Validation
    if (!formData.id || !formData.name || !formData.summary) {
      toast.error("Please fill in required fields: ID, Name, and Summary");
      return;
    }

    try {
      setSaving(true);

      const projectData = {
        id: formData.id,
        name: formData.name,
        status: activateNow ? "active" : formData.status,
        summary: formData.summary,
        background: formData.background || null,
        githubUrl: formData.githubUrl || null,
        githubRepo: formData.githubRepo || null,
        githubDefaultBranch: formData.githubDefaultBranch || "main",
        techStack: formData.techStack,
        skillsRequired: formData.skillsRequired,
        skillsNiceToHave: formData.skillsNiceToHave,
        difficultyLevel: formData.difficultyLevel || null,
        estimatedHours: formData.estimatedHours || null,
        learningOpportunities: formData.learningOpportunities,
        openTasks: formData.openTasks,
        mentorSlackUserId: formData.mentorSlackUserId || null,
        mentorName: formData.mentorName || null,
        channelId: formData.channelId || null,
        maxCandidates: formData.maxCandidates ? parseInt(formData.maxCandidates) : null,
        postedDate: activateNow ? new Date().toISOString() : null,
        expiresDate: null,
        interviewConfig: null,
        standupConfig: null,
      };

      const result = await apiClient.createProject(projectData);
      toast.success(`Project ${activateNow ? "created and activated" : "created as draft"}!`);
      router.push(`/projects/${result.project.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      toast.error("Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Create Project</h1>
        <p className="text-gray-500 mt-1">Add a new project to the catalog</p>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="space-y-4">
            <FieldGroup label="Project ID" required description="Unique identifier (lowercase, hyphens)">
              <Input
                value={formData.id}
                onChange={(e) => updateField("id", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="e.g., ai-slack-bot"
              />
            </FieldGroup>

            <FieldGroup label="Project Name" required>
              <Input
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., AI Slack Bot"
              />
            </FieldGroup>

            <FieldGroup label="Status" required>
              <Select value={formData.status} onValueChange={(value) => updateField("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>

            <FieldGroup label="Summary" required description="Brief one-line description">
              <Textarea
                value={formData.summary}
                onChange={(e) => updateField("summary", e.target.value)}
                placeholder="A concise summary of the project..."
                rows={2}
              />
            </FieldGroup>

            <FieldGroup label="Background" description="Detailed project background and context">
              <Textarea
                value={formData.background}
                onChange={(e) => updateField("background", e.target.value)}
                placeholder="Provide context, goals, and any relevant background information..."
                rows={4}
              />
            </FieldGroup>
          </div>
        </div>

        {/* GitHub Information */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">GitHub Repository</h2>
          <div className="space-y-4">
            <FieldGroup label="GitHub URL" description="Full repository URL">
              <Input
                value={formData.githubUrl}
                onChange={(e) => {
                  updateField("githubUrl", e.target.value);
                  parseGitHubUrl(e.target.value);
                }}
                placeholder="https://github.com/owner/repo"
              />
            </FieldGroup>

            <FieldGroup label="Repository" description="Auto-parsed from URL (owner/repo)">
              <Input
                value={formData.githubRepo}
                onChange={(e) => updateField("githubRepo", e.target.value)}
                placeholder="owner/repo"
              />
            </FieldGroup>

            <FieldGroup label="Default Branch">
              <Input
                value={formData.githubDefaultBranch}
                onChange={(e) => updateField("githubDefaultBranch", e.target.value)}
                placeholder="main"
              />
            </FieldGroup>
          </div>
        </div>

        {/* Technical Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Technical Details</h2>
          <div className="space-y-4">
            <FieldGroup label="Tech Stack" description="Technologies used (press Enter to add)">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={techStackInput}
                    onChange={(e) => setTechStackInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArrayItem("techStack", techStackInput, () => setTechStackInput(""));
                      }
                    }}
                    placeholder="e.g., React, Node.js, PostgreSQL"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addArrayItem("techStack", techStackInput, () => setTechStackInput(""))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.techStack.map((tech, i) => (
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
              </div>
            </FieldGroup>

            <FieldGroup label="Required Skills">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={skillsRequiredInput}
                    onChange={(e) => setSkillsRequiredInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArrayItem("skillsRequired", skillsRequiredInput, () => setSkillsRequiredInput(""));
                      }
                    }}
                    placeholder="e.g., JavaScript, REST APIs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addArrayItem("skillsRequired", skillsRequiredInput, () => setSkillsRequiredInput(""))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.skillsRequired.map((skill, i) => (
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
              </div>
            </FieldGroup>

            <FieldGroup label="Nice-to-Have Skills">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={skillsNiceInput}
                    onChange={(e) => setSkillsNiceInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArrayItem("skillsNiceToHave", skillsNiceInput, () => setSkillsNiceInput(""));
                      }
                    }}
                    placeholder="e.g., Docker, AWS"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addArrayItem("skillsNiceToHave", skillsNiceInput, () => setSkillsNiceInput(""))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.skillsNiceToHave.map((skill, i) => (
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
              </div>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Difficulty Level">
                <Select
                  value={formData.difficultyLevel}
                  onValueChange={(value) => updateField("difficultyLevel", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>

              <FieldGroup label="Estimated Hours">
                <Input
                  value={formData.estimatedHours}
                  onChange={(e) => updateField("estimatedHours", e.target.value)}
                  placeholder="e.g., 40-60 hours"
                />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* Learning & Tasks */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Learning & Tasks</h2>
          <div className="space-y-4">
            <FieldGroup label="Learning Opportunities">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={learningOppInput}
                    onChange={(e) => setLearningOppInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArrayItem("learningOpportunities", learningOppInput, () => setLearningOppInput(""));
                      }
                    }}
                    placeholder="e.g., Learn API design patterns"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addArrayItem("learningOpportunities", learningOppInput, () => setLearningOppInput(""))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {formData.learningOpportunities.map((opp, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-purple-50 rounded text-sm"
                    >
                      <span>{opp}</span>
                      <button onClick={() => removeArrayItem("learningOpportunities", i)}>
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </FieldGroup>

            <FieldGroup label="Open Tasks">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={openTaskInput}
                    onChange={(e) => setOpenTaskInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArrayItem("openTasks", openTaskInput, () => setOpenTaskInput(""));
                      }
                    }}
                    placeholder="e.g., Implement user authentication"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addArrayItem("openTasks", openTaskInput, () => setOpenTaskInput(""))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {formData.openTasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-orange-50 rounded text-sm"
                    >
                      <span>{task}</span>
                      <button onClick={() => removeArrayItem("openTasks", i)}>
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </FieldGroup>
          </div>
        </div>

        {/* Mentor & Configuration */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Mentor & Configuration</h2>
          <div className="space-y-4">
            <FieldGroup label="Mentor Slack User ID" description="Slack ID of the mentor">
              <Input
                value={formData.mentorSlackUserId}
                onChange={(e) => updateField("mentorSlackUserId", e.target.value)}
                placeholder="e.g., U01234ABCDE"
              />
            </FieldGroup>

            <FieldGroup label="Mentor Name">
              <Input
                value={formData.mentorName}
                onChange={(e) => updateField("mentorName", e.target.value)}
                placeholder="e.g., John Doe"
              />
            </FieldGroup>

            <FieldGroup label="Slack Channel ID" description="Channel for standups and updates">
              <Input
                value={formData.channelId}
                onChange={(e) => updateField("channelId", e.target.value)}
                placeholder="e.g., C01234ABCDE"
              />
            </FieldGroup>

            <FieldGroup label="Max Candidates" description="Maximum number of candidates">
              <Input
                type="number"
                value={formData.maxCandidates}
                onChange={(e) => updateField("maxCandidates", e.target.value)}
                placeholder="e.g., 3"
              />
            </FieldGroup>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save as Draft"
              )}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save & Activate"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
