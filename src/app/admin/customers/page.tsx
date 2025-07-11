
"use client";

import { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, getDocs, query, where, serverTimestamp, Timestamp, doc, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import type { Customer, CustomerLink, QuestionnaireVersion, EmailTemplate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from '@/components/ui/date-picker'; 
import { useToast } from '@/hooks/use-toast';
import { UsersRound, PlusCircle, ClipboardList, LinkIcon, Trash2, CalendarDays, FileSignature, ExternalLink, Edit, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { addDays, format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

const initialCustomerState = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  sector: '',
  numberOfEmployees: '',
  turnover: '',
  province: '',
  need: '',
};

type SortKey = 'fullName' | 'email' | 'sector' | 'createdAt' | 'numberOfEmployees' | 'turnover' | 'province';

export default function AdminCustomersPage() {
  useRequireAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // Create customer state
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(initialCustomerState);
  const [returnDeadline, setReturnDeadline] = useState<Date | undefined>();

  // Edit customer state
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  // Manage links state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isManageLinksOpen, setIsManageLinksOpen] = useState(false);
  const [customerLinks, setCustomerLinks] = useState<CustomerLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);

  // Generate link state
  const [isGenerateLinkOpen, setIsGenerateLinkOpen] = useState(false);
  const [questionnaireVersions, setQuestionnaireVersions] = useState<QuestionnaireVersion[]>([]);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<string>('');
  const [linkExpiresAt, setLinkExpiresAt] = useState<Date | undefined>(addDays(new Date(), 14));
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'createdAt', direction: 'descending' });

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      const q = query(collection(db, 'customers'));
      const querySnapshot = await getDocs(q);
      const fetchedCustomers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: (doc.data().createdAt as Timestamp)?.toDate ? (doc.data().createdAt as Timestamp).toDate() : new Date(doc.data().createdAt),
        returnDeadline: (doc.data().returnDeadline as Timestamp)?.toDate ? (doc.data().returnDeadline as Timestamp).toDate() : undefined,
      } as Customer));
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch customers." });
    }
    setIsLoadingCustomers(false);
  };

  const fetchQuestionnaireVersions = async () => {
    try {
      const q = query(collection(db, 'questionnaireVersions'), where("isActive", "==", true));
      const querySnapshot = await getDocs(q);
      const versions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: (doc.data().createdAt as Timestamp)?.toDate ? (doc.data().createdAt as Timestamp).toDate() : new Date(doc.data().createdAt),
      } as QuestionnaireVersion));
      setQuestionnaireVersions(versions);
    } catch (error) {
      console.error("Error fetching questionnaire versions:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch questionnaire versions." });
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchQuestionnaireVersions();
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setNewCustomer(prev => ({ ...prev, [id]: value }));
  };

  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCustomer.firstName.trim() || !newCustomer.email.trim()) {
      toast({ variant: "destructive", title: "Missing required fields", description: "Please enter First Name and Email." });
      return;
    }
    try {
      const customerDoc: any = {
        ...newCustomer,
        createdAt: serverTimestamp(),
        returnDeadline: returnDeadline ? Timestamp.fromDate(returnDeadline) : null,
      };

      await addDoc(collection(db, 'customers'), customerDoc);

      toast({ title: "Customer Created", description: `${newCustomer.firstName} has been added.` });
      setNewCustomer(initialCustomerState);
      setReturnDeadline(undefined);
      setIsCreateCustomerOpen(false);
      fetchCustomers();
    } catch (error) {
      console.error("Error creating customer:", error);
      toast({ variant: "destructive", title: "Creation Failed", description: "Could not create customer." });
    }
  };

  const openEditDialog = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsEditCustomerOpen(true);
  };

  const handleEditInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!customerToEdit) return;
    const { id, value } = e.target;
    setCustomerToEdit(prev => prev ? { ...prev, [id]: value } : null);
  };

  const handleEditDateChange = (date: Date | undefined) => {
    if (!customerToEdit) return;
    setCustomerToEdit(prev => prev ? { ...prev, returnDeadline: date } : null);
  };

  const handleUpdateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerToEdit) return;
    if (!customerToEdit.firstName.trim() || !customerToEdit.email.trim()) {
      toast({ variant: "destructive", title: "Missing required fields", description: "Please enter First Name and Email." });
      return;
    }
    try {
      const customerRef = doc(db, 'customers', customerToEdit.id);
      const { id, createdAt, ...updateData } = customerToEdit; // Exclude id and createdAt from update
      
      const dataToUpdate: any = {
          ...updateData,
          returnDeadline: customerToEdit.returnDeadline ? Timestamp.fromDate(new Date(customerToEdit.returnDeadline)) : null,
      };

      await updateDoc(customerRef, dataToUpdate);

      toast({ title: "Customer Updated", description: `${customerToEdit.firstName} has been updated.` });
      setIsEditCustomerOpen(false);
      setCustomerToEdit(null);
      fetchCustomers();
    } catch (error) {
      console.error("Error updating customer:", error);
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update customer." });
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      await deleteDoc(doc(db, "customers", customerId));
      toast({ title: "Customer Deleted", description: "The customer record has been removed." });
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer: ", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete the customer.",
      });
    }
  };

  const openManageLinksDialog = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsManageLinksOpen(true);
    fetchCustomerLinks(customer.id);
  };

  const fetchCustomerLinks = async (customerId: string) => {
    if (!customerId) return;
    setIsLoadingLinks(true);
    try {
      const q = query(collection(db, 'customerLinks'), where("customerId", "==", customerId));
      const querySnapshot = await getDocs(q);
      const links = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
          expiresAt: (data.expiresAt as Timestamp)?.toDate ? (data.expiresAt as Timestamp).toDate() : new Date(data.expiresAt),
        } as CustomerLink;
      });
      setCustomerLinks(links.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error("Error fetching customer links:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch customer links." });
    }
    setIsLoadingLinks(false);
  };

  const sendNotificationEmail = async (templateId: string, recipientEmail: string, data: Record<string, string>) => {
    try {
        const templateRef = doc(db, 'emailTemplates', templateId);
        const templateSnap = await getDoc(templateRef);
        if (!templateSnap.exists()) {
            console.error(`Email template ${templateId} not found.`);
            toast({ variant: 'destructive', title: 'Email Not Sent', description: 'The email template could not be found.' });
            return;
        }

        const template = templateSnap.data() as EmailTemplate;
        let { subject, body } = template;

        for (const key in data) {
            subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
            body = body.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
        }

        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: recipientEmail, subject, html: body }),
        });

        if (response.ok) {
            toast({ title: 'Notification Sent', description: `An email has been sent to ${recipientEmail}.` });
        } else {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to send email from server.');
        }

    } catch (error: any) {
        console.error('Failed to send notification email:', error);
        toast({ variant: 'destructive', title: 'Email Failed', description: error.message || 'The notification email could not be sent.' });
    }
  };

  const handleGenerateLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedQuestionnaireId || !linkExpiresAt) {
      toast({ variant: "destructive", title: "Missing fields", description: "Please select a questionnaire and expiry date." });
      return;
    }
    const version = questionnaireVersions.find(v => v.id === selectedQuestionnaireId);
    if (!version) {
      toast({ variant: "destructive", title: "Error", description: "Selected questionnaire version not found." });
      return;
    }

    setIsGeneratingLink(true);
    try {
      const linkId = uuidv4();
      await setDoc(doc(db, 'customerLinks', linkId), {
        customerId: selectedCustomer.id,
        customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName || ''}`.trim(),
        customerEmail: selectedCustomer.email,
        questionnaireVersionId: selectedQuestionnaireId,
        questionnaireVersionName: version.name,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(linkExpiresAt),
        status: "pending",
      });
      
      toast({ title: "Link Generated", description: `New assessment link created for ${selectedCustomer.firstName}.` });

      // Send email notification
      await sendNotificationEmail(
        'newAssessment',
        selectedCustomer.email,
        {
          customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName || ''}`.trim(),
          questionnaireName: version.name,
          assessmentLink: `${window.location.origin}/assessment/${linkId}`,
          expiryDate: format(linkExpiresAt, "PPP"),
        }
      );

      setIsGenerateLinkOpen(false);
      setSelectedQuestionnaireId('');
      setLinkExpiresAt(addDays(new Date(), 14));
      if (selectedCustomer) fetchCustomerLinks(selectedCustomer.id);
    } catch (error) {
      console.error("Error generating link:", error);
      toast({ variant: "destructive", title: "Link Generation Failed", description: "Could not generate assessment link." });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
     try {
      await deleteDoc(doc(db, "customerLinks", linkId));
      toast({ title: "Link Deleted", description: "The assessment link has been removed." });
      if (selectedCustomer) fetchCustomerLinks(selectedCustomer.id);
    } catch (error) {
      console.error("Error deleting link: ", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete the link.",
      });
    }
  };
  
  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedCustomers = useMemo(() => {
    let sortableItems = [...customers];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const key = sortConfig.key;
        let aValue: any;
        let bValue: any;

        if (key === 'fullName') {
          aValue = `${a.firstName} ${a.lastName || ''}`.trim().toLowerCase();
          bValue = `${b.firstName} ${b.lastName || ''}`.trim().toLowerCase();
        } else {
          aValue = a[key as keyof Customer];
          bValue = b[key as keyof Customer];
        }

        if (aValue === undefined || aValue === null || aValue === '') return 1;
        if (bValue === undefined || bValue === null || bValue === '') return -1;
        
        if (key === 'createdAt') {
          return (a.createdAt.getTime() - b.createdAt.getTime()) * (sortConfig.direction === 'ascending' ? 1 : -1);
        }

        if (key === 'numberOfEmployees' || key === 'turnover') {
          const numA = parseFloat(String(aValue).replace(/[^0-9.-]+/g, ""));
          const numB = parseFloat(String(bValue).replace(/[^0-9.-]+/g, ""));
          if (!isNaN(numA) && !isNaN(numB)) {
            if (numA < numB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (numA > numB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
          }
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
  }, [customers, sortConfig]);

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

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <UsersRound className="w-8 h-8 text-primary" />
              <CardTitle className="text-2xl font-headline">Customer Management</CardTitle>
            </div>
            <CardDescription>
              Manage customer records and their assessment links.
            </CardDescription>
          </div>
          <Dialog open={isCreateCustomerOpen} onOpenChange={setIsCreateCustomerOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Create Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Customer</DialogTitle>
                <DialogDescription>Enter the details for the new customer. First Name and Email are required.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateCustomer}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={newCustomer.firstName} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={newCustomer.lastName} onChange={handleInputChange} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={newCustomer.email} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input id="jobTitle" value={newCustomer.jobTitle} onChange={handleInputChange} />
                  </div>
                  <div>
                    <Label htmlFor="sector">Sector</Label>
                    <Input id="sector" value={newCustomer.sector} onChange={handleInputChange} />
                  </div>
                   <div>
                    <Label htmlFor="numberOfEmployees">Number of Employees</Label>
                    <Input id="numberOfEmployees" value={newCustomer.numberOfEmployees} onChange={handleInputChange} />
                  </div>
                  <div>
                    <Label htmlFor="turnover">Turnover</Label>
                    <Input id="turnover" value={newCustomer.turnover} onChange={handleInputChange} />
                  </div>
                  <div>
                    <Label htmlFor="province">Province</Label>
                    <Input id="province" value={newCustomer.province} onChange={handleInputChange} />
                  </div>
                   <div>
                    <Label htmlFor="returnDeadline">Return Deadline</Label>
                    <DatePicker date={returnDeadline} setDate={setReturnDeadline} className="w-full" />
                  </div>
                   <div className="md:col-span-2">
                    <Label htmlFor="need">Need</Label>
                    <Input id="need" value={newCustomer.need} onChange={handleInputChange} />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                  <Button type="submit">Create Customer</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingCustomers ? (
             <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : customers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No customers found. Create one to get started!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader sortKey="fullName">Full Name</SortableHeader>
                  <SortableHeader sortKey="email">Email</SortableHeader>
                  <SortableHeader sortKey="sector">Sector</SortableHeader>
                  <SortableHeader sortKey="numberOfEmployees">No. of Employees</SortableHeader>
                  <SortableHeader sortKey="turnover">Turnover</SortableHeader>
                  <SortableHeader sortKey="province">Province</SortableHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{`${customer.firstName} ${customer.lastName || ''}`.trim()}</TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>{customer.sector || 'N/A'}</TableCell>
                    <TableCell>{customer.numberOfEmployees || 'N/A'}</TableCell>
                    <TableCell>{customer.turnover || 'N/A'}</TableCell>
                    <TableCell>{customer.province || 'N/A'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openManageLinksDialog(customer)}>
                        <ClipboardList className="mr-2 h-4 w-4" /> Links
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => openEditDialog(customer)} aria-label="Edit customer">
                          <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="icon" aria-label="Delete customer">
                              <Trash2 className="h-4 w-4" />
                           </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the customer record for {customer.firstName}.
                                This will not delete any associated assessment links.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id)}>
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
      
      {/* Edit Customer Dialog */}
      {customerToEdit && (
        <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>Update the details for {customerToEdit.firstName}.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateCustomer}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={customerToEdit.firstName} onChange={handleEditInputChange} required />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={customerToEdit.lastName || ''} onChange={handleEditInputChange} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={customerToEdit.email} onChange={handleEditInputChange} required />
                </div>
                <div>
                  <Label htmlFor="jobTitle">Job Title</Label>
                  <Input id="jobTitle" value={customerToEdit.jobTitle || ''} onChange={handleEditInputChange} />
                </div>
                <div>
                  <Label htmlFor="sector">Sector</Label>
                  <Input id="sector" value={customerToEdit.sector || ''} onChange={handleEditInputChange} />
                </div>
                <div>
                  <Label htmlFor="numberOfEmployees">Number of Employees</Label>
                  <Input id="numberOfEmployees" value={customerToEdit.numberOfEmployees || ''} onChange={handleEditInputChange} />
                </div>
                <div>
                  <Label htmlFor="turnover">Turnover</Label>
                  <Input id="turnover" value={customerToEdit.turnover || ''} onChange={handleEditInputChange} />
                </div>
                <div>
                  <Label htmlFor="province">Province</Label>
                  <Input id="province" value={customerToEdit.province || ''} onChange={handleEditInputChange} />
                </div>
                <div>
                  <Label htmlFor="returnDeadline">Return Deadline</Label>
                  <DatePicker date={customerToEdit.returnDeadline} setDate={handleEditDateChange} className="w-full" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="need">Need</Label>
                  <Input id="need" value={customerToEdit.need || ''} onChange={handleEditInputChange} />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" onClick={() => setCustomerToEdit(null)}>Cancel</Button></DialogClose>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}


      {selectedCustomer && (
        <Dialog open={isManageLinksOpen} onOpenChange={(isOpen) => { setIsManageLinksOpen(isOpen); if (!isOpen) setSelectedCustomer(null); }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Manage Links for {`${selectedCustomer.firstName} ${selectedCustomer.lastName || ''}`.trim()}</DialogTitle>
              <DialogDescription>View, generate, or revoke assessment links for this customer.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <Dialog open={isGenerateLinkOpen} onOpenChange={setIsGenerateLinkOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <FileSignature className="mr-2 h-4 w-4" /> Generate New Link
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Generate New Assessment Link</DialogTitle>
                    <DialogDescription>Select a questionnaire and set an expiry date.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleGenerateLink} className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="questionnaireVersion">Questionnaire Version</Label>
                       <Select value={selectedQuestionnaireId} onValueChange={setSelectedQuestionnaireId} disabled={isGeneratingLink}>
                        <SelectTrigger id="questionnaireVersion">
                          <SelectValue placeholder="Select a version" />
                        </SelectTrigger>
                        <SelectContent>
                          {questionnaireVersions.length > 0 ? questionnaireVersions.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          )) : <SelectItem value="-" disabled>No active versions</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="expiresAt">Expires At</Label>
                      <DatePicker date={linkExpiresAt} setDate={setLinkExpiresAt} className="w-full" disabled={isGeneratingLink}/>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button type="button" variant="outline" disabled={isGeneratingLink}>Cancel</Button></DialogClose>
                      <Button type="submit" disabled={isGeneratingLink}>
                        {isGeneratingLink ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : "Generate Link"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              {isLoadingLinks ? (
                 <div className="space-y-2"> {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : customerLinks.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No links found for this customer.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Questionnaire</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires At</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerLinks.map(link => (
                      <TableRow key={link.id}>
                        <TableCell>{link.questionnaireVersionName || link.questionnaireVersionId}</TableCell>
                        <TableCell><span className={`px-2 py-1 text-xs rounded-full ${link.status === 'completed' ? 'bg-green-100 text-green-700' : link.status === 'pending' || link.status === 'started' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{link.status}</span></TableCell>
                        <TableCell>{format(link.expiresAt, "PPP")}</TableCell>
                        <TableCell>
                          <Link href={`/assessment/${link.id}`} target="_blank">
                            <span className="text-primary hover:underline flex items-center text-sm">
                              <ExternalLink className="h-3 w-3 mr-1"/> View
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteLink(link.id)} aria-label="Delete link">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
             <DialogFooter>
                <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
