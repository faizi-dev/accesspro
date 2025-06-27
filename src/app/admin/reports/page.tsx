
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import type { CustomerResponse, CustomerLink } from '@/lib/types';
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
import { Badge } from '@/components/ui/badge';

interface AssessmentListItem {
  id: string;
  customerName?: string;
  questionnaireVersionName?: string;
  submittedAt?: Date;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "started" | "completed" | "expired";
}

type SortKey = 'customerName' | 'questionnaireVersionName' | 'submittedAt' | 'status' | 'createdAt' | 'expiresAt';

export default function AdminReportsListPage() {
  useRequireAuth();
  const { toast } = useToast();

  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'createdAt', direction: 'descending' });

  useEffect(() => {
    const fetchAssessments = async () => {
      setIsLoading(true);
      try {
        const linksQuery = query(collection(db, 'customerLinks'), orderBy('createdAt', 'desc'));
        const responsesQuery = query(collection(db, 'customerResponses'));

        const [linksSnapshot, responsesSnapshot] = await Promise.all([
          getDocs(linksQuery),
          getDocs(responsesQuery),
        ]);
        
        const responsesMap = new Map<string, CustomerResponse>();
        responsesSnapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const response = {
                id: docSnap.id,
                ...data,
                submittedAt: (data.submittedAt as Timestamp)?.toDate ? (data.submittedAt as Timestamp).toDate() : new Date(data.submittedAt),
            } as CustomerResponse;
            responsesMap.set(response.id, response);
        });

        const fetchedAssessments = linksSnapshot.docs.map(docSnap => {
          const data = docSnap.data() as Omit<CustomerLink, 'id'>;
          const linkId = docSnap.id;
          const responseData = responsesMap.get(linkId);

          return {
            id: linkId,
            customerName: data.customerName || 'N/A',
            questionnaireVersionName: data.questionnaireVersionName || 'N/A',
            status: data.status,
            createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
            expiresAt: (data.expiresAt as Timestamp)?.toDate ? (data.expiresAt as Timestamp).toDate() : new Date(data.expiresAt),
            submittedAt: responseData?.submittedAt,
          };
        });
        
        setAssessments(fetchedAssessments);
      } catch (error) {
        console.error("Error fetching assessments:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch assessment list." });
      }
      setIsLoading(false);
    };
    fetchAssessments();
  }, [toast]);
  
  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedAssessments = useMemo(() => {
    let sortableItems = [...assessments];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const key = sortConfig.key;
        let aValue: any = a[key as keyof AssessmentListItem];
        let bValue: any = b[key as keyof AssessmentListItem];

        if (key === 'submittedAt' || key === 'createdAt' || key === 'expiresAt') {
          const dateA = aValue ? new Date(aValue).getTime() : 0;
          const dateB = bValue ? new Date(bValue).getTime() : 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          if (sortConfig.direction === 'ascending') {
            return dateA - dateB;
          } else {
            return dateB - dateA;
          }
        }
        
        aValue = String(aValue || '').toLowerCase();
        bValue = String(bValue || '').toLowerCase();

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
  }, [assessments, sortConfig]);

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

  const getStatusBadge = (status: AssessmentListItem['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-200">Completed</Badge>;
      case 'started':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200">In Progress</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200">Pending</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
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
            <CardTitle className="text-2xl font-headline">Assessments</CardTitle>
          </div>
          <CardDescription>
            Browse all assessments. Reports are available for completed items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <div className="py-10 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-muted-foreground">No Assessments Found</h3>
              <p className="text-muted-foreground mt-2">
                There are no assessments to display yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader sortKey="customerName">Customer Name</SortableHeader>
                  <SortableHeader sortKey="questionnaireVersionName">Questionnaire</SortableHeader>
                  <SortableHeader sortKey="status">Status</SortableHeader>
                  <SortableHeader sortKey="expiresAt">Expires At</SortableHeader>
                  <SortableHeader sortKey="submittedAt">Submitted At</SortableHeader>
                  <SortableHeader sortKey="createdAt">Created At</SortableHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAssessments.map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell className="font-medium">{assessment.customerName}</TableCell>
                    <TableCell>{assessment.questionnaireVersionName}</TableCell>
                    <TableCell>{getStatusBadge(assessment.status)}</TableCell>
                    <TableCell>{assessment.expiresAt ? format(assessment.expiresAt, 'PPP') : 'N/A'}</TableCell>
                    <TableCell>{assessment.submittedAt ? format(assessment.submittedAt, 'PPP p') : 'N/A'}</TableCell>
                    <TableCell>{assessment.createdAt ? format(assessment.createdAt, 'PPP p') : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      {assessment.status === 'completed' ? (
                        <Link href={`/admin/reports/${assessment.id}`} passHref>
                          <Button variant="outline" size="sm">
                            View Report <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          View Report <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      )}
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
