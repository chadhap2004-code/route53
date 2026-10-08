"use client";
// Page frame used by every console page: side nav, breadcrumbs, notifications, optional split panel.
import AppLayout, { type AppLayoutProps } from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup, { type BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import Flashbar from "@cloudscape-design/components/flashbar";
import { useState, type ReactNode } from "react";
import { useFollow } from "@/lib/useFollow";
import Navigation from "./Navigation";
import { useNotifications } from "./Notifications";

interface Props {
  breadcrumbs: BreadcrumbGroupProps.Item[];
  children: ReactNode;
  contentType?: AppLayoutProps.ContentType;
  splitPanel?: ReactNode;
  splitPanelOpen?: boolean;
  onSplitPanelToggle?: (open: boolean) => void;
}

export default function ConsoleLayout({
  breadcrumbs,
  children,
  contentType = "default",
  splitPanel,
  splitPanelOpen,
  onSplitPanelToggle,
}: Props) {
  const [navOpen, setNavOpen] = useState(true);
  const { items } = useNotifications();
  const follow = useFollow();
  return (
    <AppLayout
      headerSelector="#top-nav"
      navigation={<Navigation />}
      navigationOpen={navOpen}
      onNavigationChange={(e) => setNavOpen(e.detail.open)}
      toolsHide
      contentType={contentType}
      breadcrumbs={<BreadcrumbGroup items={breadcrumbs} onFollow={follow} ariaLabel="Breadcrumbs" />}
      notifications={<Flashbar items={items} stackItems={items.length > 2} />}
      content={children}
      splitPanel={splitPanel}
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={(e) => onSplitPanelToggle?.(e.detail.open)}
      splitPanelPreferences={{ position: "bottom" }}
    />
  );
}

export const route53Crumb = { text: "Route 53", href: "/route53/v2/dashboard" };
export const zonesCrumb = { text: "Hosted zones", href: "/route53/v2/hostedzones" };
