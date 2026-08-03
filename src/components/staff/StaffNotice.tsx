import type { ReactNode } from "react";
import { StaffPage, StaffPageHeader } from "./StaffPage";
import { StatePanel } from "@/components/states/StatePanel";
import { Button } from "@/components/ui/Button";
import { InfoIcon } from "@/components/ui/Icons";

/**
 * Honest, useful screen for staff routes whose action lives on another screen
 * (or whose backend does not exist yet). It never shows fake data or prototype
 * wording — it explains the situation and routes the user to the real feature.
 */
export function StaffNotice({
  title,
  description,
  panelTitle,
  panelBody,
  icon,
  links = [],
}: {
  title: string;
  description?: string;
  panelTitle: string;
  panelBody: string;
  icon?: ReactNode;
  links?: { label: string; href: string; variant?: "primary" | "secondary" }[];
}) {
  return (
    <StaffPage>
      <StaffPageHeader title={title} description={description} />
      <StatePanel
        icon={icon ?? <InfoIcon />}
        title={panelTitle}
        body={panelBody}
        dashed
        action={
          links.length > 0 ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {links.map((l) => (
                <Button key={l.href} href={l.href} variant={l.variant ?? "secondary"}>
                  {l.label}
                </Button>
              ))}
            </div>
          ) : undefined
        }
      />
    </StaffPage>
  );
}
