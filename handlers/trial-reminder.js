const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});
const TABLE = process.env.DYNAMODB_TABLE;

module.exports.handler = async () => {
  const now = new Date();
  const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Scan for companies with trialing status
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
    // Trial ends within the next 3 days (but not already expired)
    return trialEnd > now && trialEnd <= threeDaysOut;
  });

  let sent = 0;
  for (const company of companies) {
    const email = company.email;
    if (!email) continue;

    const trialEndDate = new Date(company.trialEndsAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const name = company.name || 'there';

    try {
      await ses.send(new SendEmailCommand({
        Source: 'noreply@fencetrace.com',
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: 'Your FenceTrace trial ends in 3 days' },
          Body: {
            Html: {
              Data: `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2c2417;">
  <h2 style="color: #c0622e;">Fence<span style="color: #2c2417;">Trace</span></h2>
  <p>Hi ${name},</p>
  <p>Your free trial ends on <strong>${trialEndDate}</strong>.</p>
  <p>Subscribe now to keep creating estimates, generating PDFs, and managing your fence projects.</p>
  <p style="margin: 24px 0;">
    <a href="https://fencetrace.com" style="background: #c0622e; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Subscribe Now</a>
  </p>
  <p style="color: #6b6052; font-size: 0.85em;">Questions? Just reply to this email.</p>
</body>
</html>`
            }
          }
        }
      }));

      // Mark as reminded so we don't send duplicates
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: company.PK, SK: company.SK },
        UpdateExpression: 'SET trialReminderSent = :val',
        ExpressionAttributeValues: { ':val': true }
      }));

      sent++;
    } catch (err) {
      console.error('Failed to send trial reminder to', email, err);
    }
  }

  return { sent, checked: companies.length };
};
