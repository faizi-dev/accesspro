
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import type { CustomerResponse } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FileSearch, ArrowRight, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

type SortKey = 'customerName' | 'questionnaireVersionName' | 'submittedAt';

export default function AdminReportsListPage() {
  useRequireAuth();
  const { toast } = useToast();

  const [responses, setResponses] = useState<CustomerResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'submittedAt', direction: 'descending' });

  useEffect(() => {
    const fetchCompletedResponses = async () => {
      setIsLoading(true);
      try {
        const responsesQuery = query(
          collection(db, 'customerResponses'),
          orderBy('submittedAt', 'desc')
        );
        const querySnapshot = await getDocs(responsesQuery);
        
        const fetchedResponses = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            submittedAt: (data.submittedAt as Timestamp)?.toDate ? (data.submittedAt as Timestamp).toDate() : new Date(data.submittedAt),
          } as CustomerResponse;
        });
        
        setResponses(fetchedResponses);
      } catch (error) {
        console.error("Error fetching completed responses:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch completed assessment responses." });
      }
      setIsLoading(false);
    };
    fetchCompletedResponses();
  }, [toast]);
  
  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedResponses = useMemo(() => {
    let sortableItems = [...responses];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const key = sortConfig.key;
        let aValue: any = a[key as keyof CustomerResponse];
        let bValue: any = b[key as keyof CustomerResponse];

        if (aValue === undefined || aValue === null || aValue === '') return 1;
        if (bValue === undefined || bValue === null || bValue === '') return -1;
        
        if (key === 'submittedAt') {
          return (aValue.getTime() - bValue.getTime()) * (sortConfig.direction === 'ascending' ? 1 : -1);
        }

        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [responses, sortConfig]);

  const SortableHeader = ({ sortKey, children, className }: { sortKey: SortKey, children: React.ReactNode, className?: string }) => (
    <TableHead className={className}>
      <Button variant="ghost" onClick={() => requestSort(sortKey)} className="px-2 py-1 h-auto">
        {children}
        {sortConfig.key === sortKey ? (
          sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4 inline-block" /> : <ArrowDown className="ml-2 h-4 w-4 inline-block" />
        ) : <ArrowUpDown className="ml-2 h-4 w-4 inline-block opacity-30" />}
      </Button>
    </TableHead>
  );

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <FileSearch className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Assessment Reports</CardTitle>
          </div>
          <CardDescription>
            View submitted assessment reports. Loading...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <FileSearch className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Assessment Reports</CardTitle>
          </div>
          <CardDescription>
            Browse and view detailed reports for all completed assessments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {responses.length === 0 ? (
            <div className="py-10 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-muted-foreground">No Completed Assessments</h3>
              <p className="text-muted-foreground mt-2">
                There are no completed assessments to display reports for yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader sortKey="customerName">Customer Name</SortableHeader>
                  <SortableHeader sortKey="questionnaireVersionName">Questionnaire</SortableHeader>
                  <SortableHeader sortKey="submittedAt">Submitted At</SortableHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResponses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell className="font-medium">{response.customerName || 'N/A'}</TableCell>
                    <TableCell>{response.questionnaireVersionName}</TableCell>
                    <TableCell>{response.submittedAt ? format(response.submittedAt, 'PPP p') : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/reports/${response.id}`} passHref>
                        <Button variant="outline" size="sm">
                          View Report <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
