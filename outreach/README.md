# Outreach pipeline (SES)

20 verified fence-contractor prospects in `prospects.json` (every email was
observed on the company's own website — none guessed). `send-outreach.js`
sends batches of 5 via SES from todd@fencetrace.com, Reply-To
portertoddc@gmail.com, with an opt-out P.S. and a sent-log so nothing
double-sends.

## One-time setup (REQUIRED before first send)

DKIM is enabled in SES but the DNS records must be added, or Gmail-hosted
recipients will junk the mail:

```sh
# Records are in SES already; this just publishes them to Route53.
aws route53 change-resource-record-sets --hosted-zone-id Z034210220UJFLSY9V2RP \
  --change-batch '{"Changes":[
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"43ogbwuij72wwudhkal4mccmfbtol43l._domainkey.fencetrace.com","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"43ogbwuij72wwudhkal4mccmfbtol43l.dkim.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"akr36p4d6ur4mzufrloe3usxv4jt3lyi._domainkey.fencetrace.com","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"akr36p4d6ur4mzufrloe3usxv4jt3lyi.dkim.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"klcdwuejsh3jrklhw5eeeh7ltqcsgg4z._domainkey.fencetrace.com","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"klcdwuejsh3jrklhw5eeeh7ltqcsgg4z.dkim.amazonses.com"}]}}]}'

# Wait until this says SUCCESS (usually < 30 min):
aws sesv2 get-email-identity --email-identity fencetrace.com --region us-east-1 \
  --query 'DkimAttributes.Status'
```

## Sending

```sh
node outreach/send-outreach.js              # dry run
node outreach/send-outreach.js --send       # send next 5
```

5 per day. Replies arrive at portertoddc@gmail.com (Reply-To). The same 20
emails also exist as Gmail drafts (created 2026-06-10) — if you send from
Gmail instead, delete the corresponding prospect here or vice versa. DO NOT
send both.
