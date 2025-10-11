"use client";

import { BusinessContext } from "@/lib/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Building2, Users, Server } from "lucide-react";

interface ContextCardProps {
  context: BusinessContext;
  onEdit?: () => void;
}

const entityTypeIcons = {
  CLIENT: Building2,
  VENDOR: Users,
  PLATFORM: Server,
};

const entityTypeColors = {
  CLIENT: "bg-primary",
  VENDOR: "bg-secondary",
  PLATFORM: "bg-accent",
};

export function ContextCard({ context, onEdit }: ContextCardProps) {
  const Icon = entityTypeIcons[context.entityType as keyof typeof entityTypeIcons] || Building2;

  return (
    <Card className="hover:shadow-executive-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${entityTypeColors[context.entityType as keyof typeof entityTypeColors] || "bg-muted"}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{context.entityName}</CardTitle>
              {context.industry && (
                <CardDescription className="text-xs mt-1">
                  {context.industry}
                </CardDescription>
              )}
            </div>
          </div>
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Entity Type Badge */}
        <div>
          <Badge variant={context.entityType === "CLIENT" ? "default" : "secondary"}>
            {context.entityType}
          </Badge>
          {!context.isActive && (
            <Badge variant="outline" className="ml-2">
              Inactive
            </Badge>
          )}
        </div>

        {/* Description */}
        {context.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {context.description}
          </p>
        )}

        {/* Aliases */}
        {context.aliases && context.aliases.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Aliases:</p>
            <div className="flex flex-wrap gap-1">
              {context.aliases.slice(0, 3).map((alias, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {alias}
                </Badge>
              ))}
              {context.aliases.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{context.aliases.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Technology Portfolio */}
        {context.technologyPortfolio && (
          <div>
            <p className="text-xs font-medium mb-1">Technology:</p>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {context.technologyPortfolio}
            </p>
          </div>
        )}

        {/* Service Details */}
        {context.serviceDetails && (
          <div>
            <p className="text-xs font-medium mb-1">Service Details:</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {context.serviceDetails}
            </p>
          </div>
        )}

        {/* Key Contacts */}
        {context.keyContacts && context.keyContacts.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Key Contacts:</p>
            <div className="space-y-1">
              {context.keyContacts.slice(0, 2).map((contact, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  <span className="font-medium">{contact.name}</span> - {contact.role}
                </div>
              ))}
              {context.keyContacts.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  +{context.keyContacts.length - 2} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Slack Channels */}
        {context.slackChannels && context.slackChannels.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Slack Channels:</p>
            <div className="flex flex-wrap gap-1">
              {context.slackChannels.slice(0, 3).map((channel, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  #{channel.name}
                </Badge>
              ))}
              {context.slackChannels.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{context.slackChannels.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* CMDB Identifiers */}
        {context.cmdbIdentifiers && context.cmdbIdentifiers.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">CMDB Items:</p>
            <div className="space-y-1">
              {context.cmdbIdentifiers.slice(0, 2).map((item, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  <span className="font-medium">{item.ciName || "Unnamed"}</span>
                  {item.ipAddresses && item.ipAddresses.length > 0 && (
                    <span className="ml-1">({item.ipAddresses[0]})</span>
                  )}
                </div>
              ))}
              {context.cmdbIdentifiers.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  +{context.cmdbIdentifiers.length - 2} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Context Stewards */}
        {context.contextStewards && context.contextStewards.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1">Stewards:</p>
            <div className="flex flex-wrap gap-1">
              {context.contextStewards.slice(0, 2).map((steward, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {steward.name || steward.type}
                </Badge>
              ))}
              {context.contextStewards.length > 2 && (
                <Badge variant="secondary" className="text-xs">
                  +{context.contextStewards.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
