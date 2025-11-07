"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { businessContextSchema, type BusinessContextFormData } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Plus, X } from "lucide-react"
import type { BusinessContext } from "@/lib/api-client"

interface BusinessContextFormProps {
  initialData?: Partial<BusinessContext>
  onSubmit: (data: Partial<BusinessContext>) => Promise<void>
  onCancel?: () => void
  submitText?: string
}

export function BusinessContextForm({
  initialData,
  onSubmit,
  onCancel,
  submitText = "Save",
}: BusinessContextFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<BusinessContextFormData>({
    resolver: zodResolver(businessContextSchema),
    defaultValues: {
      entityName: initialData?.entityName || "",
      entityType: initialData?.entityType || "CLIENT",
      industry: initialData?.industry || "",
      description: initialData?.description || "",
      technologyPortfolio: initialData?.technologyPortfolio || "",
      serviceDetails: initialData?.serviceDetails || "",
      aliases: (initialData?.aliases || []).map(alias => ({ value: alias })),
      relatedEntities: (initialData?.relatedEntities || []).map(entity => ({ value: entity })),
      relatedCompanies: initialData?.relatedCompanies || [],
      keyContacts: initialData?.keyContacts || [],
      slackChannels: initialData?.slackChannels || [],
      cmdbIdentifiers: initialData?.cmdbIdentifiers || [],
      contextStewards: initialData?.contextStewards || [],
      isActive: initialData?.isActive ?? true,
    },
  })

  const { fields: aliasFields, append: appendAlias, remove: removeAlias } = useFieldArray({
    control,
    name: "aliases" as const,
  })

  const { fields: entityFields, append: appendEntity, remove: removeEntity } = useFieldArray({
    control,
    name: "relatedEntities" as const,
  })

  const { fields: companyFields, append: appendCompany, remove: removeCompany } = useFieldArray<BusinessContextFormData, "relatedCompanies">({
    control,
    name: "relatedCompanies",
  })

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray<BusinessContextFormData, "keyContacts">({
    control,
    name: "keyContacts",
  })

  const { fields: channelFields, append: appendChannel, remove: removeChannel } = useFieldArray<BusinessContextFormData, "slackChannels">({
    control,
    name: "slackChannels",
  })

  const { fields: cmdbFields, append: appendCmdb, remove: removeCmdb } = useFieldArray<BusinessContextFormData, "cmdbIdentifiers">({
    control,
    name: "cmdbIdentifiers",
  })

  const { fields: stewardFields, append: appendSteward, remove: removeSteward } = useFieldArray<BusinessContextFormData, "contextStewards">({
    control,
    name: "contextStewards",
  })

  const transformAndSubmit = handleSubmit(async (formData) => {
    // Transform object arrays back to string arrays for API compatibility
    const transformedData: Partial<BusinessContext> = {
      ...formData,
      aliases: formData.aliases?.map(a => a.value),
      relatedEntities: formData.relatedEntities?.map(e => e.value),
    }
    await onSubmit(transformedData)
  })

  return (
    <form onSubmit={transformAndSubmit} className="space-y-6">
      {/* Basic Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="entityName">Entity Name *</Label>
          <Input id="entityName" {...register("entityName")} />
          {errors.entityName && <p className="text-sm text-red-600 mt-1">{errors.entityName.message}</p>}
        </div>

        <div>
          <Label htmlFor="entityType">Type *</Label>
          <Select id="entityType" {...register("entityType")}>
            <option value="CLIENT">CLIENT</option>
            <option value="VENDOR">VENDOR</option>
            <option value="PLATFORM">PLATFORM</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" {...register("industry")} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="isActive" {...register("isActive")} className="w-4 h-4" />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" {...register("description")} rows={3} />
      </div>

      <div>
        <Label htmlFor="technologyPortfolio">Technology Portfolio</Label>
        <Textarea id="technologyPortfolio" {...register("technologyPortfolio")} rows={2} />
      </div>

      <div>
        <Label htmlFor="serviceDetails">Service Details</Label>
        <Textarea id="serviceDetails" {...register("serviceDetails")} rows={2} />
      </div>

      {/* Aliases */}
      <div>
        <Label>Aliases</Label>
        <div className="space-y-2 mt-2">
          {aliasFields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <Input {...register(`aliases.${index}.value` as const)} placeholder="Alias name" />
              <Button type="button" variant="outline" size="icon" onClick={() => removeAlias(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendAlias({ value: "" })}>
            <Plus className="w-4 h-4" /> Add Alias
          </Button>
        </div>
      </div>

      {/* Related Entities */}
      <div>
        <Label>Related Entities</Label>
        <div className="space-y-2 mt-2">
          {entityFields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <Input {...register(`relatedEntities.${index}.value` as const)} placeholder="Entity name" />
              <Button type="button" variant="outline" size="icon" onClick={() => removeEntity(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendEntity({ value: "" })}>
            <Plus className="w-4 h-4" /> Add Entity
          </Button>
        </div>
      </div>

      {/* Related Companies */}
      <div>
        <Label>Related Companies</Label>
        <div className="space-y-3 mt-2">
          {companyFields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input {...register(`relatedCompanies.${index}.companyName`)} placeholder="Company name" />
                <Select {...register(`relatedCompanies.${index}.relationship`)}>
                  <option value="Parent Company">Parent Company</option>
                  <option value="Subsidiary">Subsidiary</option>
                  <option value="Sister Company">Sister Company</option>
                  <option value="Partner">Partner</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input {...register(`relatedCompanies.${index}.notes`)} placeholder="Notes" />
                <Button type="button" variant="outline" size="icon" onClick={() => removeCompany(index)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendCompany({ companyName: "", relationship: "Sister Company" })}>
            <Plus className="w-4 h-4" /> Add Company
          </Button>
        </div>
      </div>

      {/* Key Contacts */}
      <div>
        <Label>Key Contacts</Label>
        <div className="space-y-3 mt-2">
          {contactFields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Input {...register(`keyContacts.${index}.name`)} placeholder="Name" />
                <Input {...register(`keyContacts.${index}.role`)} placeholder="Role" />
                <Input {...register(`keyContacts.${index}.email`)} type="email" placeholder="Email" />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => removeContact(index)}>
                <X className="w-4 h-4" /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendContact({ name: "", role: "", email: "" })}>
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Slack Channels */}
      <div>
        <Label>Slack Channels</Label>
        <div className="space-y-3 mt-2">
          {channelFields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Input {...register(`slackChannels.${index}.name`)} placeholder="Channel name" />
                <Input {...register(`slackChannels.${index}.channelId`)} placeholder="Channel ID" />
                <Input {...register(`slackChannels.${index}.notes`)} placeholder="Notes" />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => removeChannel(index)}>
                <X className="w-4 h-4" /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendChannel({ name: "", channelId: "", notes: "" })}>
            <Plus className="w-4 h-4" /> Add Channel
          </Button>
        </div>
      </div>

      {/* CMDB Identifiers */}
      <div>
        <Label>CMDB Identifiers</Label>
        <div className="space-y-3 mt-2">
          {cmdbFields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-2">
                <Input {...register(`cmdbIdentifiers.${index}.ciName`)} placeholder="CI Name" />
                <Input {...register(`cmdbIdentifiers.${index}.sysId`)} placeholder="Sys ID" />
              </div>
              <Input {...register(`cmdbIdentifiers.${index}.ownerGroup`)} placeholder="Owner Group" />
              <Textarea {...register(`cmdbIdentifiers.${index}.description`)} placeholder="Description" rows={2} />
              <Button type="button" variant="outline" size="sm" onClick={() => removeCmdb(index)}>
                <X className="w-4 h-4" /> Remove CI
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendCmdb({ ciName: "", sysId: "" })}>
            <Plus className="w-4 h-4" /> Add CMDB Identifier
          </Button>
        </div>
      </div>

      {/* Context Stewards */}
      <div>
        <Label>Context Stewards</Label>
        <div className="space-y-3 mt-2">
          {stewardFields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Select {...register(`contextStewards.${index}.type`)}>
                  <option value="channel">Channel</option>
                  <option value="user">User</option>
                  <option value="usergroup">User Group</option>
                </Select>
                <Input {...register(`contextStewards.${index}.id`)} placeholder="ID" />
                <Input {...register(`contextStewards.${index}.name`)} placeholder="Name" />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => removeSteward(index)}>
                <X className="w-4 h-4" /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendSteward({ type: "channel", id: "", name: "" })}>
            <Plus className="w-4 h-4" /> Add Steward
          </Button>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitText}
        </Button>
      </div>
    </form>
  )
}
