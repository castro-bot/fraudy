"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FilePlus2,
  ShieldAlert,
  ChevronRight,
  Building2,
  Network,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  {
    label: "Bandeja",
    href: "/",
    icon: LayoutDashboard,
    description: "Semáforo de siniestros",
  },
  {
    label: "Chat",
    href: "/chat",
    icon: MessageSquare,
    description: "Agente FraudIA",
  },
  {
    label: "Nuevo Siniestro",
    href: "/nuevo",
    icon: FilePlus2,
    description: "Evaluar caso",
  },
  {
    label: "Proveedores",
    href: "/proveedores",
    icon: Building2,
    description: "Análisis de proveedores",
  },
  {
    label: "Red",
    href: "/red",
    icon: Network,
    description: "Red de relaciones",
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-white/[0.06]">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/30">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-tight text-foreground">
              FraudIA
            </span>
            <span className="text-[11px] text-muted-foreground">
              Aseguradora del Sur
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.label}
                      className={
                        isActive
                          ? "bg-white/[0.08] text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {item.label}
                      </span>
                      {isActive && (
                        <ChevronRight className="ml-auto h-3 w-3 opacity-50 group-data-[collapsible=icon]:hidden" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 group-data-[collapsible=icon]:hidden">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
            Modo
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Revisión humana obligatoria
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
