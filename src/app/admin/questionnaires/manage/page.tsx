
"use client";

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { QuestionnaireVersion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Eye, Trash2, Edit3, PlusCircle, ToggleLeft, ToggleRight, FileText } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';

export default function ManageQuestionnairesPage() {
  useRequireAuth();
  const [versions, setVersions] = useState<QuestionnaireVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchVersions = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'questionnaireVersions'));
      const fetchedVersions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt) , // Convert Firebase Timestamp
        } as QuestionnaireVersion;
      });
      setVersions(fetchedVersions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error("Error fetching questionnaire versions: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch questionnaire versions.",
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchVersions();
  }, []);

  const toggleActiveStatus = async (versionId: string, currentStatus: boolean) => {
    try {
      const versionRef = doc(db, 'questionnaireVersions', versionId);
      await updateDoc(versionRef, { isActive: !currentStatus });
      toast({
        title: "Status Updated",
        description: `Questionnaire version ${versionId} is now ${!currentStatus ? 'active' : 'inactive'}.`,
      });
      fetchVersions(); // Refresh the list
    } catch (error) {
      console.error("Error updating status: ", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update questionnaire status.",
      });
    }
  };

  const deleteVersion = async (versionId: string) => {
    try {
      await deleteDoc(doc(db, 'questionnaireVersions', versionId));
      toast({
        title: "Version Deleted",
        description: `Questionnaire version ${versionId} has been deleted.`,
      });
      fetchVersions(); // Refresh the list
    } catch (error) {
      console.error("Error deleting version: ", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete questionnaire version.",
      });
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><FileText className="mr-2 h-6 w-6" /> Manage Questionnaire Versions</CardTitle>
          <CardDescription>View, activate, or delete questionnaire versions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-2xl font-headline flex items-center"><FileText className="mr-2 h-7 w-7" /> Manage Questionnaire Versions</CardTitle>
          <CardDescription>View, activate, preview, or delete questionnaire versions.</CardDescription>
        </div>
        <Link href="/admin/questionnaires/upload" passHref>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Upload New Version
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {versions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No questionnaire versions found. Upload one to get started!</p>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version Name</TableHead>
              <TableHead>Version ID</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="font-medium">{version.name}</TableCell>
                <TableCell>{version.id}</TableCell>
                <TableCell>{version.createdAt.toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button
                    variant={version.isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleActiveStatus(version.id, version.isActive)}
                    className={`flex items-center gap-1 ${version.isActive ? 'bg-green-500 hover:bg-green-600 text-white' : 'text-muted-foreground'}`}
                  >
                    {version.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    {version.isActive ? 'Active' : 'Inactive'}
                  </Button>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Link href={`/admin/questionnaires/${version.id}/preview`} passHref>
                    <Button variant="outline" size="icon" aria-label="Preview">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  {/* Edit might be complex, for now it's a placeholder */}
                  <Button variant="outline" size="icon" disabled aria-label="Edit">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon" aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the questionnaire version "{version.name}".
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteVersion(version.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  );
}
