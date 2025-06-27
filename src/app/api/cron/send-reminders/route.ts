
import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { sendEmail } from '@/lib/email';
import type { CustomerLink, EmailTemplate } from '@/lib/types';
import { differenceInDays, format, startOfToday } from 'date-fns';

/**
 * Renders an email template with the provided data.
 * @param templateId The ID of the email template in Firestore.
 * @param data A key-value object for placeholder replacement.
 * @returns The rendered subject and HTML body, or null if the template is not found.
 */
async function getRenderedTemplate(templateId: EmailTemplate['id'], data: Record<string, string>) {
  try {
    const templateRef = doc(db, 'emailTemplates', templateId);
    const templateSnap = await getDoc(templateRef);

    if (!templateSnap.exists()) {
      console.error(`CRON: Email template ${templateId} not found in Firestore.`);
      return null;
    }

    const template = templateSnap.data() as EmailTemplate;
    let { subject, body } = template;

    for (const key in data) {
      subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
    }

    return { subject, html: body };
  } catch (error) {
    console.error(`CRON: Error fetching template ${templateId}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn("CRON: Unauthorized attempt with incorrect or missing secret.");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Fetch all active (pending or started) assessment links
  const linksQuery = query(collection(db, 'customerLinks'), where("status", "in", ["pending", "started"]));
  const linksSnapshot = await getDocs(linksQuery);
  
  if (linksSnapshot.empty) {
    return NextResponse.json({ message: 'Cron job finished. No active links to process.' });
  }
  
  const links = linksSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CustomerLink));
  
  const today = startOfToday();
  const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
  const adminEmail = process.env.SMTP_FROM_EMAIL;
  
  if (!adminEmail) {
    console.error("CRON: SMTP_FROM_EMAIL is not set. Cannot send admin notifications.");
  }

  // 3. Process each link to check if a reminder is due
  for (const link of links) {
    if (!link.expiresAt || !link.customerEmail) {
        results.skipped++;
        continue;
    }
    
    const expiresAt = (link.expiresAt as unknown as Timestamp).toDate();
    const daysUntilExpiry = differenceInDays(expiresAt, today);

    // Continue to next link if no reminder is due today
    if (daysUntilExpiry !== 7 && daysUntilExpiry !== 2) {
      continue;
    }

    const templateData = {
        customerName: link.customerName || 'Valued Customer',
        customerEmail: link.customerEmail,
        questionnaireName: link.questionnaireVersionName || 'Assessment',
        assessmentLink: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/assessment/${link.id}`,
        expiryDate: format(expiresAt, "PPP"),
    };

    // 7-day reminder
    if (daysUntilExpiry === 7) {
      const rendered = await getRenderedTemplate('reminder7Day', templateData);
      if (rendered) {
        const emailResult = await sendEmail({ to: link.customerEmail, ...rendered });
        emailResult.success ? results.sent++ : results.failed++;
        if(!emailResult.success && emailResult.message) results.errors.push(emailResult.message);
      } else {
        results.failed++;
        results.errors.push(`Template 'reminder7Day' not found.`);
      }
    }

    // 2-day reminders
    if (daysUntilExpiry === 2) {
      // Customer reminder
      const renderedCustomer = await getRenderedTemplate('reminder2DayCustomer', templateData);
      if (renderedCustomer) {
        const emailResult = await sendEmail({ to: link.customerEmail, ...renderedCustomer });
        emailResult.success ? results.sent++ : results.failed++;
        if(!emailResult.success && emailResult.message) results.errors.push(emailResult.message);
      } else {
        results.failed++;
        results.errors.push(`Template 'reminder2DayCustomer' not found.`);
      }

      // Admin reminder
      if (adminEmail) {
        const renderedAdmin = await getRenderedTemplate('reminder2DayAdmin', templateData);
        if (renderedAdmin) {
          const emailResult = await sendEmail({ to: adminEmail, ...renderedAdmin });
          emailResult.success ? results.sent++ : results.failed++;
          if(!emailResult.success && emailResult.message) results.errors.push(emailResult.message);
        } else {
          results.failed++;
          results.errors.push(`Template 'reminder2DayAdmin' not found.`);
        }
      }
    }
  }

  return NextResponse.json({ message: `Cron job finished.`, ...results });
}
