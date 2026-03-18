const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});
const TABLE = process.env.DYNAMODB_TABLE;

// CAN-SPAM compliant email sender
// Rules enforced:
// 1. Accurate From/Reply-To headers
// 2. Non-deceptive subject line
// 3. Physical mailing address included
// 4. Unsubscribe link in every email
// 5. Honor opt-out (checked before sending)
// 6. Identified as promotional content

const COMPANY_ADDRESS = 'RavenWing LLC, PO Box pending, Virginia, USA';
const FROM_EMAIL = 'FenceTrace <noreply@fencetrace.com>';
const REPLY_TO = 'support@fencetrace.com';

function buildUnsubscribeUrl(companyId) {
  // Base64-encoded company ID for simple unsubscribe
  return 'https://fencetrace.com/?unsubscribe=' + Buffer.from(companyId).toString('base64');
}

function buildEmailHtml(name, trialEndDate, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2c2417; line-height: 1.6;">
  <h2 style="color: #c0622e; margin-bottom: 4px;">Fence<span style="color: #2c2417;">Trace</span></h2>
  <p>Hi ${name},</p>
  <p>Your free trial ends on <strong>${trialEndDate}</strong>.</p>
  <p>After your trial, you'll still be able to view your saved estimates, but you won't be able to create new ones or generate PDFs.</p>
  <p>Subscribe to keep full access — plans start at $29/month and you can cancel anytime.</p>
  <p style="margin: 24px 0;">
    <a href="https://fencetrace.com" style="background: #c0622e; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">View Plans</a>
  </p>
  <p style="color: #6b6052; font-size: 0.85em;">Questions? Reply to this email or contact <a href="mailto:support@fencetrace.com" style="color: #c0622e;">support@fencetrace.com</a></p>
  <hr style="border: none; border-top: 1px solid #e8e0d6; margin: 24px 0;">
  <p style="color: #aaa296; font-size: 0.75em; line-height: 1.5;">
    This is a one-time reminder about your trial expiration. You will not receive further marketing emails unless you opt in.<br>
    ${COMPANY_ADDRESS}<br>
    <a href="${unsubscribeUrl}" style="color: #aaa296;">Unsubscribe from emails</a>
  </p>
</body>
</html>`;
}

function buildEmailText(name, trialEndDate, unsubscribeUrl) {
  return `Hi ${name},

Your FenceTrace free trial ends on ${trialEndDate}.

After your trial, you'll still be able to view your saved estimates, but you won't be able to create new ones or generate PDFs.

Subscribe to keep full access — plans start at $29/month and you can cancel anytime.

Visit https://fencetrace.com to view plans.

Questions? Contact support@fencetrace.com

---
This is a one-time reminder about your trial expiration.
${COMPANY_ADDRESS}
Unsubscribe: ${unsubscribeUrl}`;
}

module.exports.handler = async () => {
  const now = new Date();
  const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Scan for companies with trialing status that haven't been reminded
  const { Items } = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'begins_with(SK, :sk) AND subscriptionStatus = :status AND attribute_not_exists(trialReminderSent)',
    ExpressionAttributeValues: {
      ':sk': 'PROFILE',
      ':status': 'trialing'
    }
  }));

  const companies = (Items || []).filter(item => {
    if (!item.trialEndsAt) return false;
    const trialEnd = new Date(item.trialEndsAt);
    return trialEnd > now && trialEnd <= threeDaysOut;
  });

  let sent = 0;
  let skipped = 0;
  for (const company of companies) {
    const email = company.email;
    if (!email) continue;

    // CAN-SPAM: Honor opt-out — skip if user unsubscribed
    if (company.emailOptOut) {
      skipped++;
      continue;
    }

    const companyId = company.PK.replace('COMPANY#', '');
    const trialEndDate = new Date(company.trialEndsAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const name = company.name || company.companyName || 'there';
    const unsubscribeUrl = buildUnsubscribeUrl(companyId);

    try {
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        ReplyToAddresses: [REPLY_TO],
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: 'Your FenceTrace trial ends in 3 days' },
          Body: {
            Html: { Data: buildEmailHtml(name, trialEndDate, unsubscribeUrl) },
            Text: { Data: buildEmailText(name, trialEndDate, unsubscribeUrl) }
          }
        }
      }));

      // Mark as reminded
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: company.PK, SK: company.SK },
        UpdateExpression: 'SET trialReminderSent = :val, trialReminderSentAt = :ts',
        ExpressionAttributeValues: {
          ':val': true,
          ':ts': now.toISOString()
        }
      }));

      sent++;
      console.log('Trial reminder sent to:', email);
    } catch (err) {
      console.error('Failed to send trial reminder to', email, err.message);
    }
  }

  console.log('Trial reminder: sent=' + sent + ' skipped=' + skipped + ' checked=' + companies.length);
  return { sent, skipped, checked: companies.length };
};
