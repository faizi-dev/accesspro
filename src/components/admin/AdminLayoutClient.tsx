"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  LogOut,
  Settings,
  UploadCloud,
  ShieldCheck,
  Home,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/questionnaires", label: "Questionnaires", icon: FileText,
    subItems: [
      { href: "/admin/questionnaires/upload", label: "Upload New", icon: UploadCloud },
      { href: "/admin/questionnaires/manage", label: "Manage Versions", icon: Settings },
    ]
  },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Logged Out", description: "You have been successfully logged out." });
      router.push("/admin/login");
    } catch (error) {
      console.error("Logout failed:", error);
      toast({ variant: "destructive", title: "Logout Failed", description: "Could not log you out. Please try again." });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full">
        <div className="w-64 border-r p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar" className="border-r">
        <SidebarHeader className="p-4 items-center">
            <Link href="/admin/dashboard" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                <ShieldCheck className="w-8 h-8 text-primary" />
                <h1 className="text-2xl font-headline font-semibold text-primary group-data-[collapsible=icon]:hidden">AssessPro</h1>
            </Link>
          <div className="ml-auto group-data-[collapsible=icon]:hidden">
            <SidebarTrigger />
          </div>
        </SidebarHeader>

        <SidebarContent asChild>
          <ScrollArea className="h-full">
            <SidebarMenu className="px-2">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} asChild>
                    <SidebarMenuButton
                      isActive={pathname === item.href || (item.subItems && pathname.startsWith(item.href))}
                      tooltip={item.label}
                      className="justify-start"
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                  {item.subItems && (pathname.startsWith(item.href) || pathname === item.href ) && (
                     <ul className="pl-7 pt-1 space-y-1 group-data-[collapsible=icon]:hidden">
                       {item.subItems.map(subItem => (
                         <li key={subItem.href}>
                           <Link href={subItem.href} asChild>
                             <SidebarMenuButton
                                size="sm"
                                isActive={pathname === subItem.href}
                                className="justify-start w-full text-muted-foreground hover:text-foreground"
                              >
                               <subItem.icon className="w-4 h-4 mr-2" />
                               {subItem.label}
                             </SidebarMenuButton>
                           </Link>
                         </li>
                       ))}
                     </ul>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="p-3 border-t">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <Avatar className="group-data-[collapsible=icon]:hidden">
              <AvatarImage src={`https://placehold.co/40x40.png?text=${user?.email?.[0]?.toUpperCase() ?? 'A'}`} alt={user?.email ?? "Admin"} data-ai-hint="user profile" />
              <AvatarFallback>{user?.email?.[0]?.toUpperCase() ?? 'A'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium truncate">{user?.email ?? "Admin User"}</p>
              <p className="text-xs text-muted-foreground">Administrator</p>
            </div>
          </div>
          <Link href="/" asChild>
            <SidebarMenuButton tooltip="Back to Site Home" className="mt-2 justify-start">
                <Home className="w-5 h-5" />
                <span className="group-data-[collapsible=icon]:hidden">Back to Home</span>
            </SidebarMenuButton>
          </Link>
          <SidebarMenuButton onClick={handleLogout} tooltip="Logout" className="mt-1 justify-start">
            <LogOut className="w-5 h-5" />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-slate-50">
        <main className="p-6 min-h-screen">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
