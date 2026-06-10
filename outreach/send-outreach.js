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

const FROM = 'Todd at FenceTrace <todd@fencetrace.com>';
const REPLY_TO = 'portertoddc@gmail.com';
const SIGNATURE = '\n\nTodd\nFenceTrace';
const OPT_OUT = "\n\nP.S. If you'd rather not hear from me, just reply \"no thanks\" and that's the end of it.";

const TEMPLATE = [
  'Quick math most fence guys have done the hard way: a $60 shared lead, sold',
  'to 4 other companies, half of them never answering — that\'s $600 to $1,400',
  'in lead fees for each job you actually book.',
  '',
  'I run FenceTrace. It gives homeowners a real fence estimate from a satellite',
  'photo of their yard — using YOUR material prices and YOUR labor rates — in',
  'about a minute. The leads come from your own website and referrals, they',
  'aren\'t shared with anyone, and there\'s no per-lead fee. You also see your',
  'profit on every job before you send the quote.',
  '',
  'It\'s month to month, no contract, and if you\'d like a hand loading your',
  'prices, just reply — I\'ll set your price book up for you.',
  '',
  'Worth a look? Two-minute try: https://fencetrace.com',
].join('\n');

function buildBody(p) {
  const greeting = 'Hi ' + (p.name || 'there') + ',';
  const core = p.bodyOverride || (p.opener + '\n\n' + TEMPLATE);
  return greeting + '\n\n' + core + SIGNATURE + OPT_OUT;
}

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
      Message: { Subject: { Data: p.subject }, Body: { Text: { Data: body } } },
    }));
    log[p.to] = { company: p.company, sentAt: new Date().toISOString(), subject: p.subject };
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log('sent ✓');
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\nDone. ${Object.keys(log).length}/${prospects.length} sent total.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
