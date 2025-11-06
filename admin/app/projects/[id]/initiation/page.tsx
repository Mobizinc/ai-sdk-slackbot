"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Award, TrendingUp, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { apiClient, type ProjectWithRelations, type StrategicEvaluationSummary } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InitiationPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const data = await apiClient.getProject(projectId);
      setProject(data);
    } catch (error) {
      console.error("Failed to load project:", error);
      toast.error("Failed to load project");
    }
  };

  if (!project) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const latestDraft = project.initiations[0];
  const latestEval = project.evaluations[0];

  return (
    <div className="space-y-6">
      {/* Latest Initiation Draft */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Project Initiation
          </h2>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </Button>
        </div>

        {latestDraft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 pb-4 border-b border-gray-200">
              <div>
                <span className="text-sm font-medium text-gray-500">Requested By</span>
                <p className="text-gray-900 mt-1">
                  {latestDraft.requestedByName || latestDraft.requestedBy}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Model Used</span>
                <p className="text-gray-900 mt-1">{latestDraft.llmModel || "Unknown"}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Created</span>
                <p className="text-gray-900 mt-1">
                  {new Date(latestDraft.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {latestDraft.output && Object.keys(latestDraft.output).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(latestDraft.output).map(([key, value]) => (
                  <div key={key} className="border-l-4 border-blue-500 pl-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </h4>
                    {Array.isArray(value) ? (
                      <ul className="list-disc list-inside space-y-1">
                        {value.map((item, i) => (
                          <li key={i} className="text-sm text-gray-700">
                            {String(item)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{String(value)}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic text-center py-4">No output data available</p>
            )}

            {latestDraft.sources && latestDraft.sources.length > 0 && (
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {latestDraft.sources.map((source, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                    >
                      {source.type || "Unknown source"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">No initiation draft generated yet</p>
            <Button variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Generate First Draft
            </Button>
          </div>
        )}
      </div>

      {/* Strategic Evaluations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5" />
            Strategic Evaluations
          </h2>
          <Button variant="outline" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Run Evaluation
          </Button>
        </div>

        {project.evaluations.length > 0 ? (
          <div className="space-y-3">
            {project.evaluations.map((evaluation) => {
              const isExpanded = expandedEval === evaluation.id;

              return (
                <div key={evaluation.id} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setExpandedEval(isExpanded ? null : evaluation.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {new Date(evaluation.createdAt).toLocaleDateString()}
                          </p>
                          {evaluation.totalScore !== null && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              Score: {evaluation.totalScore}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>By: {evaluation.requestedByName || evaluation.requestedBy}</span>
                          {evaluation.recommendation && (
                            <span className="capitalize">{evaluation.recommendation}</span>
                          )}
                          {evaluation.confidence && (
                            <span>Confidence: {evaluation.confidence}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 ml-2" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 ml-2" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                      {evaluation.executiveSummary && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">
                            Executive Summary
                          </h4>
                          <p className="text-sm text-gray-700">{evaluation.executiveSummary}</p>
                        </div>
                      )}

                      {evaluation.nextSteps && evaluation.nextSteps.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Next Steps</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {evaluation.nextSteps.map((step, i) => (
                              <li key={i} className="text-sm text-gray-700">
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {evaluation.keyMetrics && evaluation.keyMetrics.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Metrics</h4>
                          <div className="flex flex-wrap gap-2">
                            {evaluation.keyMetrics.map((metric, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs"
                              >
                                {metric}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {evaluation.needsClarification &&
                        evaluation.clarificationQuestions &&
                        evaluation.clarificationQuestions.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <h4 className="text-sm font-semibold text-yellow-900 mb-2">
                              Needs Clarification
                            </h4>
                            <ul className="list-disc list-inside space-y-1">
                              {evaluation.clarificationQuestions.map((question, i) => (
                                <li key={i} className="text-sm text-yellow-800">
                                  {question}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">No evaluations conducted yet</p>
            <Button variant="outline" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              Run First Evaluation
            </Button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Quick Actions</h4>
        <div className="flex gap-3">
          <Button size="sm" variant="outline">
            Run /project-initiate
          </Button>
          <Button size="sm" variant="outline">
            Run /project-evaluate
          </Button>
        </div>
        <p className="text-xs text-blue-700 mt-3">
          These commands will generate new drafts and evaluations using the latest context.
        </p>
      </div>
    </div>
  );
}
