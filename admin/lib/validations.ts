import { z } from "zod"

export const businessContextSchema = z.object({
  entityName: z.string().min(1, "Entity name is required"),
  entityType: z.enum(["CLIENT", "VENDOR", "PLATFORM"]),
  industry: z.string().optional(),
  description: z.string().optional(),
  technologyPortfolio: z.string().optional(),
  serviceDetails: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  relatedEntities: z.array(z.string()).default([]),
  relatedCompanies: z.array(z.object({
    companyName: z.string(),
    relationship: z.string(),
    notes: z.string().optional(),
  })).default([]),
  keyContacts: z.array(z.object({
    name: z.string(),
    role: z.string(),
    email: z.string().email().optional().or(z.literal("")),
  })).default([]),
  slackChannels: z.array(z.object({
    name: z.string(),
    channelId: z.string().optional(),
    notes: z.string().optional(),
  })).default([]),
  cmdbIdentifiers: z.array(z.object({
    ciName: z.string().optional(),
    sysId: z.string().optional(),
    ownerGroup: z.string().optional(),
    ipAddresses: z.array(z.string()).optional(),
    description: z.string().optional(),
    documentation: z.array(z.string()).optional(),
  })).default([]),
  contextStewards: z.array(z.object({
    type: z.enum(["channel", "user", "usergroup"]),
    id: z.string().optional(),
    name: z.string().optional(),
    notes: z.string().optional(),
  })).default([]),
  isActive: z.boolean().default(true),
})

export type BusinessContextFormData = z.output<typeof businessContextSchema>
