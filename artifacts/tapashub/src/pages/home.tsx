import * as React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShoppingCart,
  Boxes,
  Wallet,
  Users,
  Contact,
  CheckSquare,
} from "lucide-react";

const CAPABILITIES = [
  { icon: ShoppingCart, label: "Orders", description: "Track and fulfill orders across every company" },
  { icon: Boxes, label: "Inventory", description: "Real-time stock across warehouses and brands" },
  { icon: Wallet, label: "Finance", description: "Treasury, fund allocation and reporting" },
  { icon: Users, label: "HR", description: "Employees, roles and permissions in one place" },
  { icon: Contact, label: "CRM", description: "Clients, vendors and the deals between them" },
  { icon: CheckSquare, label: "Approvals", description: "Corporate approvals routed to the right people" },
];

export default function HomePage({ basePath }: { basePath: string }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img
            src={`${basePath}/tapashub-logo.png`}
            alt="TapasHub"
            className="h-8 w-8 object-contain"
          />
          <span className="text-lg font-black tracking-tight text-foreground">TAPAS</span>
          <span className="text-lg font-black tracking-tight text-[#1d90e8]">HUB</span>
        </div>
        <Link href="/sign-in">
          <Button variant="outline">Sign In</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="flex flex-col items-center py-16 text-center sm:py-24">
          <span className="mb-4 inline-block rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            TapasHub Business OS
          </span>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            One command center for your whole business
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            TapasHub is an all-in-one business operating software — a centralized
            command center to manage orders, inventory, finances, human resources,
            CRM, and corporate approvals across a network of companies.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-in">
              <Button size="lg" className="w-full sm:w-auto">Sign In</Button>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, label, description }) => (
            <Card key={label}>
              <CardContent className="flex flex-col gap-3 p-6">
                <Icon className="h-6 w-6 text-[#1d90e8]" />
                <div>
                  <h3 className="font-semibold text-foreground">{label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} TapasHub Pvt Ltd. Access is invite-only.</p>
        </div>
      </footer>
    </div>
  );
}
