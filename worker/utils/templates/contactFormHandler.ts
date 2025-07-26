// SPDX-License-Identifier: MIT
//
// Contact form submission handler template.  This stub handles a simple
// contact form by parsing JSON input and returning a success response.  A
// code generator can extend this file to send emails, store messages in
// a database, or trigger other downstream workflows.

export async function contactFormHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const data = await req.json();
    const { name, email, message } = data;
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing name, email or message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // TODO: send an email or persist the message
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
