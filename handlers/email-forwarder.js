const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');

const s3 = new S3Client({ region: 'us-east-1' });
const ses = new SESClient({ region: 'us-east-1' });

const FORWARD_TO = 'portertoddc@gmail.com';
const BUCKET = 'fencetrace-email-us-east-1';

module.exports.handler = async (event) => {
  for (const record of event.Records) {
    const sesRecord = record.ses;
    const messageId = sesRecord.mail.messageId;
    const from = sesRecord.mail.commonHeaders.from[0] || 'unknown';
    const to = sesRecord.mail.commonHeaders.to || [];
    const subject = sesRecord.mail.commonHeaders.subject || '(no subject)';

    console.log('Forwarding email:', { messageId, from, to, subject });

    try {
      // Get the raw email from S3
      const obj = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'incoming/' + messageId
      }));

      let rawEmail = await obj.Body.transformToString();

      // Rewrite headers for forwarding
      // Replace the Return-Path and From to avoid SPF/DKIM failures
      rawEmail = rawEmail.replace(
        /^From: .+$/m,
        'From: "FenceTrace Fwd <' + to[0] + '>" <' + to[0] + '>\r\nReply-To: ' + from
      );

      // Replace the To header
      rawEmail = rawEmail.replace(
        /^To: .+$/m,
        'To: ' + FORWARD_TO
      );

      // Add a forwarding note to subject
      if (!subject.startsWith('Fwd:')) {
        rawEmail = rawEmail.replace(
          /^Subject: .+$/m,
          'Subject: Fwd: ' + subject + ' [via ' + to[0] + ']'
        );
      }

      await ses.send(new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawEmail) },
        Source: to[0],
        Destinations: [FORWARD_TO]
      }));

      console.log('Forwarded successfully:', messageId);
    } catch (err) {
      console.error('Forward failed:', messageId, err.message);
    }
  }
};
