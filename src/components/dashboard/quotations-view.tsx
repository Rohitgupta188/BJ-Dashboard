"use client";

import React, { useState } from "react";
import { 
  FileText, 
  Layers, 
  Grid, 
  Search, 
  Calendar as CalendarIcon, 
  FileDown, 
  Trash2, 
  RotateCcw, 
  Eye, 
  Truck 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initialOrders = [
  { qNo: "BJ-OWOC", date: "18-06-2026 04:57 PM", clientName: "Jewelure Ghatkopar", grWt: 3.86, netWt: 3.86 },
  { qNo: "BJ-YYZN", date: "17-06-2026 02:31 PM", clientName: "Kjo to Mayank Delhi 18kt 17-06-26", grWt: 361.03, netWt: 357.75 },
  { qNo: "BJ-JUWA", date: "17-06-2026 02:18 PM", clientName: "Kjo to Mayank Delhi 9kt 17-06-26", grWt: 294.97, netWt: 285.78 },
  { qNo: "BJ-F13G", date: "16-06-2026 08:37 PM", clientName: "Hardik 9kt stock 16-06-26", grWt: 212.65, netWt: 211.76 },
  { qNo: "BJ-X4QP", date: "15-06-2026 08:37 PM", clientName: "shrinath jewels -borivali", grWt: 5.12, netWt: 5.12 },
  { qNo: "BJ-PSEL", date: "15-06-2026 08:26 PM", clientName: "Tulsi Gold", grWt: 37.666, netWt: 37.666 },
  { qNo: "BJ-1VLM", date: "15-06-2026 08:15 PM", clientName: "G J Jewellers", grWt: 30.59, netWt: 30.59 },
  { qNo: "BJ-KIMX", date: "15-06-2026 08:10 PM", clientName: "G J Jewellers", grWt: 39.112, netWt: 38.132 },
  { qNo: "BJ-TG4W", date: "15-06-2026 03:39 PM", clientName: "hydrabad return stock to kjo 9ct hardik", grWt: 655.04, netWt: 625.05 },
];

export default function QuotationsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("2026-06-12");
  const [dateTo, setDateTo] = useState("2026-06-19");

  const filteredOrders = initialOrders.filter(order =>
    order.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.qNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* --- METRICS CARDS GRID --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-foreground">
        {/* Gross Weight */}
        <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-border bg-linear-to-b from-card to-card/65 transition-all duration-300 hover:border-primary/30 group">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gross Weight (Total)</p>
              <h3 className="text-2xl font-mono font-semibold text-foreground mt-1.5 tracking-tight group-hover:text-primary transition-colors">1,640.04 <span className="text-xs text-muted-foreground">g</span></h3>
            </div>
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_12px_rgba(197,160,89,0.08)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Net Weight */}
        <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-border bg-linear-to-b from-card to-card/65 transition-all duration-300 hover:border-primary/30 group">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Gold Weight</p>
              <h3 className="text-2xl font-mono font-semibold text-foreground mt-1.5 tracking-tight group-hover:text-primary transition-colors">1,595.71 <span className="text-xs text-muted-foreground">g</span></h3>
            </div>
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_12px_rgba(197,160,89,0.08)]">
              <Layers className="h-5 w-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-border bg-linear-to-b from-card to-card/65 transition-all duration-300 hover:border-primary/30 group">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Atelier Proposals</p>
              <h3 className="text-2xl font-mono font-semibold text-foreground mt-1.5 tracking-tight group-hover:text-primary transition-colors">9 <span className="text-xs text-muted-foreground">Active</span></h3>
            </div>
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_12px_rgba(197,160,89,0.08)]">
              <Grid className="h-5 w-5" strokeWidth={1.75} />
            </div>
          </CardContent>
        </Card>

        {/* Dispatched Ring */}
        <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-border bg-linear-to-b from-card to-card/65 transition-all duration-300 hover:border-primary/30 group">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fulfillment Rate</p>
              <h3 className="text-2xl font-mono font-semibold text-foreground mt-1.5 tracking-tight">66.7%</h3>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="currentColor" className="text-border" strokeWidth="3" fill="transparent" />
                <circle 
                  cx="24" 
                  cy="24" 
                  r="20" 
                  stroke="currentColor" 
                  className="text-primary" 
                  strokeWidth="3.5" 
                  fill="transparent" 
                  strokeDasharray="125.66" 
                  strokeDashoffset="41.88" 
                />
              </svg>
              <span className="absolute text-[9px] font-bold text-primary">66%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- ACTION & FILTERS BAR --- */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.15)] flex flex-col lg:flex-row gap-4 items-center justify-between text-foreground mt-6">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search Proposals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border focus-visible:ring-primary focus-visible:border-primary hover:bg-background/85 h-9 text-xs text-foreground transition-all duration-300"
            />
          </div>

          {/* Shadcn Select */}
          <Select defaultValue="all">
            <SelectTrigger className="w-[150px] bg-muted/30 border-border h-9 text-xs text-foreground focus:ring-primary hover:bg-muted/50 transition-colors">
              <SelectValue placeholder="Proposals State" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Statements</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Ranges & Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          <div className="flex items-center gap-2.5 border border-border rounded-lg px-3 h-9 bg-background/50 text-xs">
            <CalendarIcon className="h-3.5 w-3.5 text-primary/80" />
            <input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent outline-none text-foreground font-medium font-mono cursor-pointer border-none p-0 focus:ring-0" 
            />
            <span className="text-muted-foreground font-semibold px-0.5">to</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent outline-none text-foreground font-medium font-mono cursor-pointer border-none p-0 focus:ring-0" 
            />
          </div>

          {/* Actions Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-300">
              <FileDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-300">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9 border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-300">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="bg-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.15)] overflow-hidden text-foreground mt-6">
        <Table>
          <TableHeader className="bg-muted/20 border-b border-border">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-12 p-4"><Checkbox className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary" /></TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Proposal ID</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Creation Date</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Client Atelier</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4 text-right">Gross Wt</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4 text-right">Net Wt</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4 text-center">Action</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-muted-foreground border-border">
            {filteredOrders.map((order, index) => (
              <TableRow key={index} className="hover:bg-accent/25 border-border transition-all duration-300">
                <TableCell className="p-4"><Checkbox className="border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" /></TableCell>
                <TableCell className="font-medium text-foreground tracking-wide font-serif text-xs">{order.qNo}</TableCell>
                <TableCell className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{order.date}</TableCell>
                <TableCell className="font-semibold text-foreground text-xs max-w-xs truncate">{order.clientName}</TableCell>
                <TableCell className="text-right font-mono font-medium text-xs">{order.grWt.toFixed(2)}g</TableCell>
                <TableCell className="text-right font-mono font-bold text-xs text-primary">{order.netWt.toFixed(2)}g</TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary border border-primary/20 rounded-lg shadow-sm transition-all duration-300">
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all">
                      <Truck className="h-4 w-4" />
                    </Button>
                    <span className={`w-2 h-2 rounded-full ring-4 ${
                      index % 3 === 0 
                        ? "bg-emerald-500 ring-emerald-500/20" 
                        : index % 3 === 1 
                          ? "bg-amber-500 ring-amber-500/20" 
                          : "bg-destructive ring-destructive/20"
                    }`} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
