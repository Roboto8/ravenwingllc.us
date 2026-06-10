// Canonical outreach email builder — single source of truth for body copy.
// Used by send-outreach.js (SES), manage.js (Gmail), and the compose-link page.
const SIGNATURE = '\n\nTodd\nFenceTrace';
const OPT_OUT = "\n\nP.S. If you'd rather not hear from me, just reply \"no thanks\" and that's the end of it.";
// CAN-SPAM requires a valid physical postal address in every commercial email.
const ADDRESS = 'FenceTrace · 8115 Judith Ln Unit 2008, Mechanicsville, VA 23116';

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
  return greeting + '\n\n' + core + SIGNATURE + OPT_OUT + '\n\n' + ADDRESS;
}

// Light HTML version of the same copy — clean typography, branded signature,
// no images and no marketing layout (heavy HTML lands cold mail in the
// Promotions tab; this stays personal-looking while reading "pro").
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// htmlWrap takes any plain body whose text ends with the "Todd / FenceTrace"
// signature (and optional P.S.) and renders it with the styled signature.
function htmlWrap(body) {
  let addr = '';
  let content = body;
  if (content.endsWith('\n\n' + ADDRESS)) {
    content = content.slice(0, -('\n\n' + ADDRESS).length);
    addr = ADDRESS;
  }
  const [main, ps] = content.split('\n\nP.S. ');
  const sigIdx = main.lastIndexOf('\n\nTodd\nFenceTrace');
  const text = sigIdx > -1 ? main.slice(0, sigIdx) : main;
  const paras = text.split(/\n\n/).map(function (para) {
    let html = escapeHtml(para).replace(/\n/g, ' ');
    html = html.replace(
      /https:\/\/fencetrace\.com/g,
      '<a href="https://fencetrace.com" style="color:#c0622e;font-weight:600">fencetrace.com</a>'
    );
    return '<p style="margin:0 0 16px">' + html + '</p>';
  }).join('\n');
  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff">',
    '<div style="max-width:560px;margin:0;font-family:Georgia,\'Times New Roman\',serif;font-size:16px;line-height:1.55;color:#2c2417;padding:8px 4px">',
    paras,
    '<p style="margin:24px 0 0">Todd<br>',
    '<span style="color:#c0622e;font-weight:700;letter-spacing:0.3px">FenceTrace</span><br>',
    '<a href="https://fencetrace.com" style="color:#6b6052;font-size:13px;text-decoration:none">fencetrace.com</a></p>',
    ps ? '<p style="margin:20px 0 0;font-size:13px;color:#6b6052">P.S. ' + escapeHtml(ps).replace(/\n/g, ' ') + '</p>' : '',
    addr ? '<p style="margin:18px 0 0;font-size:11px;color:#9a9087">' + escapeHtml(addr) + '</p>' : '',
    '</div></body></html>',
  ].join('\n');
}

function buildHtmlBody(p) {
  return htmlWrap(buildBody(p));
}

module.exports = { SIGNATURE, OPT_OUT, TEMPLATE, ADDRESS, buildBody, buildHtmlBody, htmlWrap, escapeHtml };
