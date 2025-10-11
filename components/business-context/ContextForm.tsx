"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessContext, NewBusinessContext } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Save, Loader2 } from "lucide-react";

interface ContextFormProps {
  context?: BusinessContext;
  onSubmit: (data: NewBusinessContext) => Promise<void>;
  onCancel: () => void;
}

type KeyContact = { name: string; role: string; email?: string };
type SlackChannel = { name: string; channelId?: string; notes?: string };
type CmdbIdentifier = {
  ciName?: string;
  sysId?: string;
  ipAddresses?: string[];
  description?: string;
  ownerGroup?: string;
  documentation?: string[];
};
type ContextSteward = {
  type: "channel" | "user" | "usergroup";
  id?: string;
  name?: string;
  notes?: string;
};

export function ContextForm({ context, onSubmit, onCancel }: ContextFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aliases, setAliases] = useState<string[]>(context?.aliases || []);
  const [relatedEntities, setRelatedEntities] = useState<string[]>(
    context?.relatedEntities || []
  );
  const [keyContacts, setKeyContacts] = useState<KeyContact[]>(context?.keyContacts || []);
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>(context?.slackChannels || []);
  const [cmdbIdentifiers, setCmdbIdentifiers] = useState<CmdbIdentifier[]>(context?.cmdbIdentifiers || []);
  const [contextStewards, setContextStewards] = useState<ContextSteward[]>(context?.contextStewards || []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewBusinessContext>({
    defaultValues: context || {
      entityName: "",
      entityType: "CLIENT",
      industry: "",
      description: "",
      technologyPortfolio: "",
      serviceDetails: "",
      isActive: true,
    },
  });

  const onFormSubmit = async (data: NewBusinessContext) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        aliases,
        relatedEntities,
        keyContacts,
        slackChannels,
        cmdbIdentifiers,
        contextStewards,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Array field handlers
  const addArrayItem = (
    current: string[],
    setter: (items: string[]) => void,
    value: string
  ) => {
    if (value.trim() && !current.includes(value.trim())) {
      setter([...current, value.trim()]);
    }
  };

  const removeArrayItem = (
    current: string[],
    setter: (items: string[]) => void,
    index: number
  ) => {
    setter(current.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entityName">
                Entity Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entityName"
                {...register("entityName", { required: "Entity name is required" })}
                placeholder="e.g., Altman Plants"
              />
              {errors.entityName && (
                <p className="text-sm text-destructive">{errors.entityName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="entityType">
                Entity Type <span className="text-destructive">*</span>
              </Label>
              <select
                id="entityType"
                {...register("entityType", { required: "Entity type is required" })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="CLIENT">Client</option>
                <option value="VENDOR">Vendor</option>
                <option value="PLATFORM">Platform</option>
              </select>
              {errors.entityType && (
                <p className="text-sm text-destructive">{errors.entityType.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              {...register("industry")}
              placeholder="e.g., Healthcare, Technology"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Brief description of the entity..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>
              <input type="checkbox" {...register("isActive")} className="mr-2" />
              Active
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Aliases */}
      <Card>
        <CardHeader>
          <CardTitle>Aliases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add alias..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const input = e.currentTarget;
                  addArrayItem(aliases, setAliases, input.value);
                  input.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                addArrayItem(aliases, setAliases, input.value);
                input.value = "";
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {aliases.map((alias, idx) => (
              <Badge key={idx} variant="secondary" className="gap-1">
                {alias}
                <button
                  type="button"
                  onClick={() => removeArrayItem(aliases, setAliases, idx)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Related Entities */}
      <Card>
        <CardHeader>
          <CardTitle>Related Entities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add related entity..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const input = e.currentTarget;
                  addArrayItem(relatedEntities, setRelatedEntities, input.value);
                  input.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                addArrayItem(relatedEntities, setRelatedEntities, input.value);
                input.value = "";
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {relatedEntities.map((entity, idx) => (
              <Badge key={idx} variant="outline" className="gap-1">
                {entity}
                <button
                  type="button"
                  onClick={() => removeArrayItem(relatedEntities, setRelatedEntities, idx)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Technology & Service Details */}
      <Card>
        <CardHeader>
          <CardTitle>Technology & Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technologyPortfolio">Technology Portfolio</Label>
            <Textarea
              id="technologyPortfolio"
              {...register("technologyPortfolio")}
              placeholder="List of technologies, platforms, and tools used..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceDetails">Service Details</Label>
            <Textarea
              id="serviceDetails"
              {...register("serviceDetails")}
              placeholder="Service agreements, CSP information, support details..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Key Contacts */}
      <Card>
        <CardHeader>
          <CardTitle>Key Contacts ({keyContacts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {keyContacts.map((contact, idx) => (
            <div key={idx} className="p-4 border rounded-md space-y-3 bg-muted/30">
              <div className="flex justify-between items-start">
                <div className="space-y-1 flex-1">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.role}</p>
                  {contact.email && (
                    <p className="text-sm text-muted-foreground">{contact.email}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setKeyContacts(keyContacts.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-3 p-4 border-2 border-dashed rounded-md">
            <Input
              id="newContactName"
              placeholder="Name *"
            />
            <Input
              id="newContactRole"
              placeholder="Role *"
            />
            <Input
              id="newContactEmail"
              placeholder="Email (optional)"
              type="email"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const name = (document.getElementById("newContactName") as HTMLInputElement)?.value;
                const role = (document.getElementById("newContactRole") as HTMLInputElement)?.value;
                const email = (document.getElementById("newContactEmail") as HTMLInputElement)?.value;
                if (name && role) {
                  setKeyContacts([...keyContacts, { name, role, email: email || undefined }]);
                  (document.getElementById("newContactName") as HTMLInputElement).value = "";
                  (document.getElementById("newContactRole") as HTMLInputElement).value = "";
                  (document.getElementById("newContactEmail") as HTMLInputElement).value = "";
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Slack Channels */}
      <Card>
        <CardHeader>
          <CardTitle>Slack Channels ({slackChannels.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {slackChannels.map((channel, idx) => (
            <div key={idx} className="p-4 border rounded-md space-y-2 bg-muted/30">
              <div className="flex justify-between items-start">
                <div className="space-y-1 flex-1">
                  <p className="font-medium">#{channel.name}</p>
                  {channel.channelId && (
                    <p className="text-xs text-muted-foreground">ID: {channel.channelId}</p>
                  )}
                  {channel.notes && (
                    <p className="text-sm text-muted-foreground">{channel.notes}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSlackChannels(slackChannels.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-3 p-4 border-2 border-dashed rounded-md">
            <Input
              id="newChannelName"
              placeholder="Channel name *"
            />
            <Input
              id="newChannelId"
              placeholder="Channel ID (optional)"
            />
            <Textarea
              id="newChannelNotes"
              placeholder="Notes (optional)"
              rows={2}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const name = (document.getElementById("newChannelName") as HTMLInputElement)?.value;
                const channelId = (document.getElementById("newChannelId") as HTMLInputElement)?.value;
                const notes = (document.getElementById("newChannelNotes") as HTMLTextAreaElement)?.value;
                if (name) {
                  setSlackChannels([...slackChannels, { name, channelId: channelId || undefined, notes: notes || undefined }]);
                  (document.getElementById("newChannelName") as HTMLInputElement).value = "";
                  (document.getElementById("newChannelId") as HTMLInputElement).value = "";
                  (document.getElementById("newChannelNotes") as HTMLTextAreaElement).value = "";
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CMDB Identifiers */}
      <Card>
        <CardHeader>
          <CardTitle>CMDB Identifiers ({cmdbIdentifiers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cmdbIdentifiers.map((item, idx) => (
            <div key={idx} className="p-4 border rounded-md space-y-2 bg-muted/30">
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <p className="font-medium">{item.ciName || "Unnamed CI"}</p>
                  {item.sysId && (
                    <p className="text-xs text-muted-foreground">Sys ID: {item.sysId}</p>
                  )}
                  {item.ipAddresses && item.ipAddresses.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.ipAddresses.map((ip, ipIdx) => (
                        <Badge key={ipIdx} variant="outline" className="text-xs">
                          {ip}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  {item.ownerGroup && (
                    <p className="text-xs text-muted-foreground">Owner: {item.ownerGroup}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCmdbIdentifiers(cmdbIdentifiers.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-3 p-4 border-2 border-dashed rounded-md">
            <Input
              id="newCmdbCiName"
              placeholder="CI Name *"
            />
            <Input
              id="newCmdbSysId"
              placeholder="System ID (optional)"
            />
            <Input
              id="newCmdbIps"
              placeholder="IP Addresses (comma-separated)"
            />
            <Textarea
              id="newCmdbDescription"
              placeholder="Description"
              rows={2}
            />
            <Input
              id="newCmdbOwner"
              placeholder="Owner Group (optional)"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const ciName = (document.getElementById("newCmdbCiName") as HTMLInputElement)?.value;
                const sysId = (document.getElementById("newCmdbSysId") as HTMLInputElement)?.value;
                const ips = (document.getElementById("newCmdbIps") as HTMLInputElement)?.value;
                const description = (document.getElementById("newCmdbDescription") as HTMLTextAreaElement)?.value;
                const ownerGroup = (document.getElementById("newCmdbOwner") as HTMLInputElement)?.value;
                if (ciName) {
                  const ipArray = ips ? ips.split(",").map((ip) => ip.trim()).filter(Boolean) : [];
                  setCmdbIdentifiers([
                    ...cmdbIdentifiers,
                    {
                      ciName,
                      sysId: sysId || undefined,
                      ipAddresses: ipArray.length > 0 ? ipArray : undefined,
                      description: description || undefined,
                      ownerGroup: ownerGroup || undefined,
                    },
                  ]);
                  (document.getElementById("newCmdbCiName") as HTMLInputElement).value = "";
                  (document.getElementById("newCmdbSysId") as HTMLInputElement).value = "";
                  (document.getElementById("newCmdbIps") as HTMLInputElement).value = "";
                  (document.getElementById("newCmdbDescription") as HTMLTextAreaElement).value = "";
                  (document.getElementById("newCmdbOwner") as HTMLInputElement).value = "";
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add CMDB Item
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Context Stewards */}
      <Card>
        <CardHeader>
          <CardTitle>Context Stewards ({contextStewards.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contextStewards.map((steward, idx) => (
            <div key={idx} className="p-4 border rounded-md space-y-2 bg-muted/30">
              <div className="flex justify-between items-start">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{steward.type}</Badge>
                    <p className="font-medium">{steward.name || "Unnamed"}</p>
                  </div>
                  {steward.id && (
                    <p className="text-xs text-muted-foreground">ID: {steward.id}</p>
                  )}
                  {steward.notes && (
                    <p className="text-sm text-muted-foreground">{steward.notes}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setContextStewards(contextStewards.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="space-y-3 p-4 border-2 border-dashed rounded-md">
            <select
              id="newStewardType"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="channel">Channel</option>
              <option value="user">User</option>
              <option value="usergroup">User Group</option>
            </select>
            <Input
              id="newStewardName"
              placeholder="Name *"
            />
            <Input
              id="newStewardId"
              placeholder="Slack ID (optional)"
            />
            <Textarea
              id="newStewardNotes"
              placeholder="Notes (optional)"
              rows={2}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const type = (document.getElementById("newStewardType") as HTMLSelectElement)?.value as "channel" | "user" | "usergroup";
                const name = (document.getElementById("newStewardName") as HTMLInputElement)?.value;
                const id = (document.getElementById("newStewardId") as HTMLInputElement)?.value;
                const notes = (document.getElementById("newStewardNotes") as HTMLTextAreaElement)?.value;
                if (name) {
                  setContextStewards([...contextStewards, { type, name, id: id || undefined, notes: notes || undefined }]);
                  (document.getElementById("newStewardName") as HTMLInputElement).value = "";
                  (document.getElementById("newStewardId") as HTMLInputElement).value = "";
                  (document.getElementById("newStewardNotes") as HTMLTextAreaElement).value = "";
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Steward
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Context
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
