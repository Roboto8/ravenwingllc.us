// One-shot outreach sender over SES.
//
//   node outreach/send-outreach.js            # dry run — prints what WOULD send
//   node outreach/send-outreach.js --send     # sends the next batch (default 5)
//   node outreach/send-outreach.js --send --batch 3
//
// Reads outreach/prospects.json, skips anything already in
// outreach/sent-log.json, sends oldest-first with 5s spacing, and records
// every send. Designed for SMALL personal batches (5/day) — this is one-to-one
// outreach, not bulk mail. Replies go to the owner's inbox via Reply-To.
//
// PREREQ: fencetrace.com DKIM must be verified in SES before the first send
// (see outreach/README.md) or Gmail-hosted recipients will junk-folder it.
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const fs = require('fs');
const path = require('path');

const { buildBody, htmlWrap } = require('./build-body');

const FROM = 'Todd at FenceTrace <todd@fencetrace.com>';
const REPLY_TO = 'portertoddc@gmail.com';

async function main() {
  const send = process.argv.includes('--send');
  const batchIdx = process.argv.indexOf('--batch');
  const batchSize = batchIdx > -1 ? parseInt(process.argv[batchIdx + 1], 10) || 5 : 5;

  const dir = __dirname;
  const prospects = JSON.parse(fs.readFileSync(path.join(dir, 'prospects.json'), 'utf8'));
  const logPath = path.join(dir, 'sent-log.json');
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {};

  const pending = prospects.filter((p) => !log[p.to]);
  const batch = pending.slice(0, batchSize);
  console.log(`${prospects.length} prospects, ${pending.length} unsent, batch of ${batch.length}${send ? '' : ' (DRY RUN — pass --send to send)'}`);

  const ses = new SESClient({ region: 'us-east-1' });
  for (const p of batch) {
    const body = buildBody(p);
    console.log(`\n--- ${p.company} <${p.to}> — "${p.subject}"`);
    if (!send) { console.log(body.split('\n').slice(0, 4).join('\n') + '\n...'); continue; }
    await ses.send(new SendEmailCommand({
      Source: FROM,
      ReplyToAddresses: [REPLY_TO],
      Destination: { ToAddresses: [p.to] },
      Message: {
        Subject: { Data: p.subject },
        Body: { Text: { Data: body }, Html: { Data: htmlWrap(body) } },
      },
    }));
    log[p.to] = { company: p.company, sentAt: new Date().toISOString(), subject: p.subject };
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log('sent ✓');
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\nDone. ${Object.keys(log).length}/${prospects.length} sent total.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
